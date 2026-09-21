// Package stylefiber adapts Raster Style Spec v2 to Fiber v3 without changing Q2.
package stylefiber

import (
	"errors"

	"github.com/gofiber/fiber/v3"
	rasterstyle "github.com/mapseekai/raster-style/packages/go"
)

// Decoder reuses the schema and transport configuration across requests.
// It never retains a Fiber context or a reference to fasthttp's request buffer.
type Decoder struct{ codec *rasterstyle.Codec }

type localKey struct{}

func NewDecoder(options rasterstyle.Options) (*Decoder, error) {
	codec, err := rasterstyle.NewCodec(options)
	if err != nil {
		return nil, err
	}
	return &Decoder{codec: codec}, nil
}

// Parse reads the raw query exactly once, preserving repeated bidx/rescale values.
// Do not replace this with c.Queries(), which cannot preserve repeated keys.
func (decoder *Decoder) Parse(c fiber.Ctx) (*rasterstyle.Style, error) {
	if decoder == nil || decoder.codec == nil {
		return nil, fiber.NewError(fiber.StatusInternalServerError, "Raster style decoder is not initialized")
	}
	raw := c.Request().URI().QueryString()
	style, err := decoder.codec.DecodeQuery(string(raw))
	if err != nil {
		return nil, httpError(err)
	}
	return style, nil
}

// JSON is the shortest route from a Fiber query to owned, canonical JSON bytes.
func (decoder *Decoder) JSON(c fiber.Ctx) ([]byte, error) {
	style, err := decoder.Parse(c)
	if err != nil {
		return nil, err
	}
	return style.JSON(), nil
}

// Middleware validates once and stores the immutable style in request locals.
func (decoder *Decoder) Middleware() fiber.Handler {
	return func(c fiber.Ctx) error {
		style, err := decoder.Parse(c)
		if err != nil {
			return err
		}
		c.Locals(localKey{}, style)
		return c.Next()
	}
}

// FromContext retrieves the value installed by Middleware without reparsing.
func FromContext(c fiber.Ctx) (*rasterstyle.Style, bool) {
	style, ok := c.Locals(localKey{}).(*rasterstyle.Style)
	return style, ok
}

// Parse provides a convenience entry point with the standard transport budgets.
func Parse(c fiber.Ctx) (*rasterstyle.Style, error) {
	style, err := rasterstyle.DecodeQuery(string(c.Request().URI().QueryString()))
	if err != nil {
		return nil, httpError(err)
	}
	return style, nil
}

func httpError(err error) error {
	var codecError *rasterstyle.Error
	if !errors.As(err, &codecError) {
		return fiber.NewError(fiber.StatusInternalServerError, "Raster style decoding failed")
	}
	status := fiber.StatusBadRequest
	switch codecError.Code {
	case "E_LIMIT":
		status = fiber.StatusRequestURITooLong
	case "E_CONFIG":
		status = fiber.StatusInternalServerError
	}
	// Never echo the complete query or arbitrary nested configuration in errors.
	return fiber.NewError(status, codecError.Code+": "+codecError.Message)
}
