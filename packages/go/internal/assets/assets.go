// Package assets embeds immutable protocol resources. Generate with pnpm generate.
package assets

import _ "embed"

//go:embed raster-style-v3.schema.json
var Schema []byte

//go:embed query-bindings-v3.json
var Bindings []byte

//go:embed mosaic-v1.0.0.schema.json
var MosaicSchema []byte

//go:embed tile-v1.0.0.schema.json
var TileSchema []byte
