//go:build windows

package main

import (
	"errors"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	"faculty-management/attendance-helper/internal/winscan"
	"github.com/gen2brain/beeep"
	"github.com/getlantern/systray"
)

var (
	errQuitRequested = errors.New("quit requested")
	titleKeywords    = []string{"zoom poll", "zoom quiz", "poll", "quiz", "meeting poll", "meeting quiz"}
)

type popupState struct {
	mu         sync.Mutex
	lastHandle uintptr
	lastTitle  string
	notifiedAt time.Time
}

func (p *popupState) update(info winscan.WindowInfo) (changed bool) {
	p.mu.Lock()
	defer p.mu.Unlock()

	changed = p.lastHandle != info.Handle || !strings.EqualFold(p.lastTitle, info.Title)
	p.lastHandle = info.Handle
	p.lastTitle = info.Title
	return changed
}

func (p *popupState) current() (uintptr, string) {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.lastHandle, p.lastTitle
}

func (p *popupState) shouldNotify(now time.Time, cooldown time.Duration) bool {
	p.mu.Lock()
	defer p.mu.Unlock()
	if now.Sub(p.notifiedAt) < cooldown {
		return false
	}
	p.notifiedAt = now
	return true
}

func main() {
	if err := runApp(); err != nil && !errors.Is(err, errQuitRequested) {
		log.Fatal(err)
	}
}

func runApp() error {
	app := newTrayApp()
	systray.Run(app.onReady, app.onExit)
	return app.err
}

type trayApp struct {
	menuCheck *systray.MenuItem
	menuFocus *systray.MenuItem
	menuQuit  *systray.MenuItem
	state     popupState
	err       error
}

func newTrayApp() *trayApp {
	return &trayApp{}
}

func (a *trayApp) onReady() {
	systray.SetTitle("Zoom Attendance Helper")
	systray.SetTooltip("Detect Zoom quiz and poll windows. Answers stay manual.")

	a.menuCheck = systray.AddMenuItem("Check now", "Scan for Zoom quiz or poll windows")
	a.menuFocus = systray.AddMenuItem("Focus detected popup", "Bring the most recently detected popup to the foreground")
	a.menuQuit = systray.AddMenuItem("Quit", "Exit the helper")

	go a.eventLoop()
	go a.pollLoop()
}

func (a *trayApp) onExit() {}

func (a *trayApp) eventLoop() {
	for {
		select {
		case <-a.menuCheck.ClickedCh:
			a.scan(true)
		case <-a.menuFocus.ClickedCh:
			if err := a.focusLastDetected(); err != nil {
				_ = beeep.Notify("Zoom Attendance Helper", err.Error(), "")
			}
		case <-a.menuQuit.ClickedCh:
			a.err = errQuitRequested
			systray.Quit()
			return
		}
	}
}

func (a *trayApp) pollLoop() {
	ticker := time.NewTicker(3 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		if a.err != nil {
			return
		}
		a.scan(false)
	}
}

func (a *trayApp) scan(manual bool) {
	info, found, err := winscan.FindRelevantWindow(titleKeywords)
	if err != nil {
		if manual {
			_ = beeep.Notify("Zoom Attendance Helper", fmt.Sprintf("Window scan failed: %v", err), "")
		}
		return
	}

	if !found {
		if manual {
			_ = beeep.Notify("Zoom Attendance Helper", "No Zoom quiz or poll popup is visible right now.", "")
		}
		return
	}

	changed := a.state.update(info)
	if manual || changed || a.state.shouldNotify(time.Now(), 20*time.Second) {
		_ = beeep.Notify("Zoom Attendance Helper", fmt.Sprintf("Popup detected: %s", info.Title), "")
	}
}

func (a *trayApp) focusLastDetected() error {
	handle, title := a.state.current()
	if handle == 0 {
		return errors.New("no popup has been detected yet")
	}
	if err := winscan.FocusWindow(handle); err != nil {
		return fmt.Errorf("could not focus %q: %w", title, err)
	}
	return nil
}
