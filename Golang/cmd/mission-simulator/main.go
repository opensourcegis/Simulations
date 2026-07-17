//go:build windows

package main

import (
	"embed"
	"fmt"
	"os"

	webview2 "github.com/jchv/go-webview2"
)

//go:embed assets/drone-mission-planning-game.fragment.html
var assets embed.FS

const pagePrefix = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Drone Mission Planning Trainer</title>
  <style>
    :root {
      --background: #eef2f4;
      --foreground: #142332;
      --card: #ffffff;
      --card-foreground: #142332;
      --popover: #ffffff;
      --popover-foreground: #142332;
      --primary: #1d8c46;
      --primary-foreground: #ffffff;
      --secondary: #cfd9de;
      --secondary-foreground: #142332;
      --muted: #d8e1e5;
      --muted-foreground: #526271;
      --accent: #d7e7ef;
      --accent-foreground: #142332;
      --destructive: #c44d4d;
      --border: #b8c5cd;
      --input: #d7e0e5;
      --ring: #1d8c46;
      --viz-series-1: #34c759;
      --viz-series-2: #4e8dff;
      --viz-series-3: #22a4a7;
      --viz-series-4: #f59f0a;
      --viz-series-5: #e86a33;
      --viz-series-6: #8d5de8;
      --font-size-base: 16px;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      background:
        radial-gradient(circle at top left, rgba(29, 140, 70, 0.12), transparent 28%),
        linear-gradient(180deg, #e8eef1 0%, #f6f8f9 100%);
      color: var(--foreground);
      font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
      padding: 20px;
    }
  </style>
</head>
<body>
`

const pageSuffix = `
</body>
</html>
`

func main() {
	page, err := buildPage()
	if err != nil {
		showError(err)
		os.Exit(1)
	}

	runWindow(page)
}

func buildPage() (string, error) {
	fragment, err := assets.ReadFile("assets/drone-mission-planning-game.fragment.html")
	if err != nil {
		return "", fmt.Errorf("read embedded simulation: %w", err)
	}

	return pagePrefix + string(fragment) + pageSuffix, nil
}

func runWindow(page string) {
	w := webview2.NewWithOptions(webview2.WebViewOptions{
		Debug:     false,
		AutoFocus: true,
		WindowOptions: webview2.WindowOptions{
			Title:  "Drone Mission Planning Trainer",
			Width:  1440,
			Height: 920,
			Center: true,
		},
	})
	if w == nil {
		showError(fmt.Errorf("failed to initialize WebView2"))
		os.Exit(1)
	}
	defer w.Destroy()

	w.SetSize(1440, 920, webview2.HintNone)
	w.SetHtml(page)
	w.Run()
}

func showError(err error) {
	_, _ = fmt.Fprintf(os.Stderr, "mission simulator error: %v\n", err)
}
