// Run from packages/go: go run ./examples/fiber
package main

import (
	"log"

	"github.com/gofiber/fiber/v3"
	rasterstyle "github.com/mapseekai/raster-style/packages/go"
	stylefiber "github.com/mapseekai/raster-style/packages/go/fiber"
)

func main() {
	decoder, err := stylefiber.NewDecoder(rasterstyle.Options{})
	if err != nil {
		log.Fatal(err)
	}
	app := fiber.New()
	app.Get("/raster-style", decoder.Middleware(), func(c fiber.Ctx) error {
		style, ok := stylefiber.FromContext(c)
		if !ok {
			return fiber.ErrInternalServerError
		}
		return c.JSON(style)
	})
	// Authentication and source authorization belong outside this local example.
	log.Fatal(app.Listen("127.0.0.1:8080"))
}
