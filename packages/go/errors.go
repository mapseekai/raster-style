// Package rasterstyle implements Raster Style Spec v2's Q2 transport binding.
// It validates rendering configuration, but does not render raster pixels.
package rasterstyle

import "fmt"

// Error exposes stable error codes without echoing untrusted query values.
type Error struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Path    string `json:"path,omitempty"`
}

func (e *Error) Error() string {
	if e.Path != "" {
		return fmt.Sprintf("%s: %s (%s)", e.Code, e.Message, e.Path)
	}
	return e.Code + ": " + e.Message
}

func failure(code, message, path string) error {
	return &Error{Code: code, Message: message, Path: path}
}
