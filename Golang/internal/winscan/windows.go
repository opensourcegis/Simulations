//go:build windows

package winscan

import (
	"fmt"
	"strings"
	"syscall"
	"unsafe"
)

type WindowInfo struct {
	Handle uintptr
	Title  string
}

var (
	user32                     = syscall.NewLazyDLL("user32.dll")
	procEnumWindows            = user32.NewProc("EnumWindows")
	procGetWindowTextW         = user32.NewProc("GetWindowTextW")
	procGetWindowTextLengthW   = user32.NewProc("GetWindowTextLengthW")
	procIsWindowVisible        = user32.NewProc("IsWindowVisible")
	procSetForegroundWindow    = user32.NewProc("SetForegroundWindow")
	procShowWindow             = user32.NewProc("ShowWindow")
	procIsIconic               = user32.NewProc("IsIconic")
	procBringWindowToTop       = user32.NewProc("BringWindowToTop")
	procAttachThreadInput      = user32.NewProc("AttachThreadInput")
	procGetForegroundWindow    = user32.NewProc("GetForegroundWindow")
	procGetWindowThreadProcess = user32.NewProc("GetWindowThreadProcessId")
	procGetCurrentThreadID     = user32.NewProc("GetCurrentThreadId")
)

const swRestore = 9

func FindRelevantWindow(keywords []string) (WindowInfo, bool, error) {
	var found WindowInfo
	var scanErr error

	callback := syscall.NewCallback(func(hwnd uintptr, lparam uintptr) uintptr {
		if !isWindowVisible(hwnd) {
			return 1
		}

		title, err := getWindowTitle(hwnd)
		if err != nil {
			scanErr = err
			return 0
		}

		if matchesKeywords(title, keywords) {
			found = WindowInfo{Handle: hwnd, Title: title}
			return 0
		}

		return 1
	})

	ret, _, err := procEnumWindows.Call(callback, 0)
	if ret == 0 && found.Handle == 0 && scanErr == nil && err != syscall.Errno(0) {
		return WindowInfo{}, false, fmt.Errorf("EnumWindows failed: %w", err)
	}
	if scanErr != nil {
		return WindowInfo{}, false, scanErr
	}
	return found, found.Handle != 0, nil
}

func FocusWindow(hwnd uintptr) error {
	if hwnd == 0 {
		return fmt.Errorf("invalid window handle")
	}

	if iconic(hwnd) {
		procShowWindow.Call(hwnd, swRestore)
	}

	foreground, _, _ := procGetForegroundWindow.Call()
	targetThread, _, _ := procGetWindowThreadProcess.Call(hwnd, 0)
	foregroundThread, _, _ := procGetWindowThreadProcess.Call(foreground, 0)
	currentThread, _, _ := procGetCurrentThreadID.Call()

	if foregroundThread != 0 && targetThread != 0 && foregroundThread != currentThread {
		procAttachThreadInput.Call(currentThread, foregroundThread, 1)
		defer procAttachThreadInput.Call(currentThread, foregroundThread, 0)
	}

	procBringWindowToTop.Call(hwnd)
	ret, _, err := procSetForegroundWindow.Call(hwnd)
	if ret == 0 {
		return fmt.Errorf("SetForegroundWindow failed: %w", err)
	}
	return nil
}

func matchesKeywords(title string, keywords []string) bool {
	normalized := strings.ToLower(strings.TrimSpace(title))
	if normalized == "" {
		return false
	}
	for _, keyword := range keywords {
		if strings.Contains(normalized, keyword) {
			return true
		}
	}
	return strings.Contains(normalized, "zoom") && (strings.Contains(normalized, "poll") || strings.Contains(normalized, "quiz"))
}

func getWindowTitle(hwnd uintptr) (string, error) {
	length, _, _ := procGetWindowTextLengthW.Call(hwnd)
	if length == 0 {
		return "", nil
	}

	buf := make([]uint16, length+1)
	ret, _, err := procGetWindowTextW.Call(hwnd, uintptr(unsafe.Pointer(&buf[0])), uintptr(len(buf)))
	if ret == 0 {
		return "", fmt.Errorf("GetWindowTextW failed: %w", err)
	}
	return syscall.UTF16ToString(buf), nil
}

func isWindowVisible(hwnd uintptr) bool {
	ret, _, _ := procIsWindowVisible.Call(hwnd)
	return ret != 0
}

func iconic(hwnd uintptr) bool {
	ret, _, _ := procIsIconic.Call(hwnd)
	return ret != 0
}
