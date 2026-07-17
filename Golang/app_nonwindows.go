//go:build !windows

package main

import (
	"fmt"
	"log"
)

func main() {
	if err := runApp(); err != nil {
		log.Fatal(err)
	}
}

func runApp() error {
	return fmt.Errorf("this helper currently supports Windows only")
}
