package main

import (
	"syscall"
	"unsafe"
)

// messageBox shows a Windows message box (right-to-left, for the Arabic text).
func messageBox(title, text string) bool {
	user32 := syscall.NewLazyDLL("user32.dll")
	proc := user32.NewProc("MessageBoxW")
	if proc.Find() != nil {
		return false
	}
	t, _ := syscall.UTF16PtrFromString(title)
	m, _ := syscall.UTF16PtrFromString(text)
	const mbIconError, mbRight, mbRTLReading = 0x10, 0x80000, 0x100000
	proc.Call(0, uintptr(unsafe.Pointer(m)), uintptr(unsafe.Pointer(t)), mbIconError|mbRight|mbRTLReading)
	return true
}
