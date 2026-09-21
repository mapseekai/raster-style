package stylefiber

import (
	"encoding/json"
	"io"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v3"
	rasterstyle "github.com/mapseekai/raster-style/packages/go"
)

const rgbQuery = "rsv=2.0&selector=bands&bidx=4&bidx=3&bidx=2&renderer=rgb"

func TestParseAndMiddleware(t *testing.T) {
	decoder, err := NewDecoder(rasterstyle.Options{})
	if err != nil {
		t.Fatal(err)
	}
	app := fiber.New()
	var retained *rasterstyle.Style
	app.Get("/direct", func(c fiber.Ctx) error {
		style, err := decoder.Parse(c)
		if err != nil {
			return err
		}
		retained = style
		return c.JSON(style)
	})
	app.Get("/middleware", decoder.Middleware(), func(c fiber.Ctx) error {
		style, ok := FromContext(c)
		if !ok {
			t.Fatal("middleware style missing")
		}
		return c.JSON(style)
	})
	app.Get("/json", func(c fiber.Ctx) error {
		data, err := decoder.JSON(c)
		if err != nil {
			return err
		}
		c.Set(fiber.HeaderContentType, fiber.MIMEApplicationJSON)
		return c.Send(data)
	})
	app.Get("/helper", func(c fiber.Ctx) error {
		style, err := Parse(c)
		if err != nil {
			return err
		}
		return c.JSON(style)
	})
	for _, path := range []string{"/direct", "/middleware", "/json", "/helper"} {
		response, err := app.Test(httptest.NewRequest("GET", path+"?"+rgbQuery, nil))
		if err != nil {
			t.Fatal(err)
		}
		data, err := io.ReadAll(response.Body)
		response.Body.Close()
		if err != nil || response.StatusCode != 200 {
			t.Fatalf("%s: %d %s %v", path, response.StatusCode, data, err)
		}
		var document map[string]any
		if err := json.Unmarshal(data, &document); err != nil {
			t.Fatal(err)
		}
		bands := document["input"].(map[string]any)["selector"].(map[string]any)["bands"].([]any)
		if bands[0] != float64(4) || bands[1] != float64(3) || bands[2] != float64(2) {
			t.Fatal("band order lost")
		}
	}
	// A later pooled request must not invalidate an earlier parsed document.
	if retained == nil || !strings.Contains(string(retained.JSON()), "[4,3,2]") {
		t.Fatal("request memory retained unsafely")
	}
	for _, query := range []string{rgbQuery + "&renderer=rgb", rgbQuery + "&url=x", rgbQuery + "&expression=b1+b2", rgbQuery + "&expression=%FF", "rsv=2.0"} {
		response, err := app.Test(httptest.NewRequest("GET", "/direct?"+query, nil))
		if err != nil {
			t.Fatal(err)
		}
		response.Body.Close()
		if response.StatusCode != 400 {
			t.Fatalf("expected 400, got %d", response.StatusCode)
		}
	}
}

func TestQueryTooLong(t *testing.T) {
	decoder, err := NewDecoder(rasterstyle.Options{MaxQueryBytes: 8})
	if err != nil {
		t.Fatal(err)
	}
	app := fiber.New()
	app.Get("/", decoder.Middleware(), func(c fiber.Ctx) error { return c.SendStatus(200) })
	response, err := app.Test(httptest.NewRequest("GET", "/?"+rgbQuery, nil))
	if err != nil {
		t.Fatal(err)
	}
	response.Body.Close()
	if response.StatusCode != 414 {
		t.Fatalf("expected 414, got %d", response.StatusCode)
	}
}
