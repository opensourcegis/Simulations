# Zoom Attendance Helper

This local helper is for Windows and keeps attendance actions manual.

What it does:

- scans visible desktop window titles for Zoom quiz or poll popups
- shows a desktop notification when a popup is detected
- lets you manually re-scan or focus the detected popup from the system tray

What it does not do:

- it does not choose an answer
- it does not click options
- it does not submit anything

## Run on Windows

```powershell
cd Golang
go run .
```

If you prefer running the Windows entry file directly, this now also works:

```powershell
cd Golang
go run app_windows.go
```

## Build on Windows

```powershell
cd Golang
go build -o attendance-helper.exe .
```

If the tray icon library needs to be downloaded first, run:

```powershell
cd Golang
go mod tidy
```

## Mission Simulator

Run the mission-planning trainer launcher:

```powershell
cd Golang
go run ./cmd/mission-simulator
```

Build the single-file Windows executable with WebView2:

```powershell
cd Golang
go build -ldflags="-H=windowsgui" -o mission-simulator.exe ./cmd/mission-simulator
```
