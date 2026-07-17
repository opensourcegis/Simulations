//go:build !windows

package winscan

type WindowInfo struct {
	Handle uintptr
	Title  string
}

func FindRelevantWindow(_ []string) (WindowInfo, bool, error) {
	return WindowInfo{}, false, nil
}

func FocusWindow(_ uintptr) error {
	return nil
}
