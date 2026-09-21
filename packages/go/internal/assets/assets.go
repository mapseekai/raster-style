// Package assets embeds immutable protocol resources. Generate with pnpm generate.
package assets

import _ "embed"

//go:embed raster-style-v2.schema.json
var Schema []byte

//go:embed query-bindings-v2.json
var Bindings []byte
