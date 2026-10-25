// Windows desktop version of the absence-register app.
//
// The same web app as the Android version (absence-app/assets, copied to web/ by build.sh) is
// embedded in the exe and served on 127.0.0.1. It opens in a Microsoft Edge (or Chrome) app
// window; the program exits when that window is closed.
package main

import (
	"embed"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

//go:embed web
var webFS embed.FS

// A fixed port keeps the page origin stable, so the app remembers the school details between runs.
const addr = "127.0.0.1:47831"

// Without a heartbeat for this long the window is gone (browsers slow timers in minimised windows,
// so this is generous).
const heartbeatTimeout = 150 * time.Second

var lastPing atomic.Int64

func main() {
	url := "http://" + addr + "/index.html"
	ln, err := net.Listen("tcp", addr)
	if err != nil {
		// Most likely the app is already running: just open another window onto it.
		if openWindow(url) == nil {
			showError("تعذّر تشغيل البرنامج: " + err.Error())
		}
		return
	}

	web, _ := fs.Sub(webFS, "web")
	mux := http.NewServeMux()
	mux.Handle("/", noCache(http.FileServer(http.FS(web))))
	mux.HandleFunc("/__ping", func(w http.ResponseWriter, r *http.Request) {
		lastPing.Store(time.Now().Unix())
		w.WriteHeader(http.StatusNoContent)
	})
	mux.HandleFunc("/__save", handleSave)
	mux.HandleFunc("/__open", func(w http.ResponseWriter, r *http.Request) { handleShell(w, r, false) })
	mux.HandleFunc("/__reveal", func(w http.ResponseWriter, r *http.Request) { handleShell(w, r, true) })
	go http.Serve(ln, mux)

	lastPing.Store(time.Now().Unix() + 30)    // grace period while the window starts
	if os.Getenv("ABSENCE_NO_WINDOW") != "" { // for testing: serve only, a browser is opened by hand
		for time.Now().Unix()-lastPing.Load() <= int64(heartbeatTimeout/time.Second) {
			time.Sleep(3 * time.Second)
		}
		return
	}
	cmd := openWindow(url)
	if cmd == nil {
		showError("لم يتم العثور على متصفح Microsoft Edge أو Google Chrome. ثبّت أحدهما ثم أعد تشغيل البرنامج.")
		return
	}

	closed := make(chan struct{})
	go func() {
		started := time.Now()
		cmd.Wait()
		// A browser that was already running hands the window over and exits at once;
		// only a long-lived process tells us the window was closed.
		if time.Since(started) > 5*time.Second {
			close(closed)
		}
	}()
	ticker := time.NewTicker(3 * time.Second)
	for {
		select {
		case <-closed:
			return
		case <-ticker.C:
			if time.Now().Unix()-lastPing.Load() > int64(heartbeatTimeout/time.Second) {
				return
			}
		}
	}
}

func noCache(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		h.ServeHTTP(w, r)
	})
}

// openWindow starts Edge (or Chrome) in app mode with its own profile, so the window looks like a
// program rather than a browser tab. Falls back to the default browser.
func openWindow(url string) *exec.Cmd {
	profile := filepath.Join(os.Getenv("LOCALAPPDATA"), "AbsenceRegister", "browser")
	args := []string{"--app=" + url, "--user-data-dir=" + profile, "--window-size=820,1000",
		"--no-first-run", "--no-default-browser-check", "--disable-features=Translate"}
	for _, exe := range browserCandidates() {
		if _, err := os.Stat(exe); err != nil {
			continue
		}
		cmd := exec.Command(exe, args...)
		if cmd.Start() == nil {
			return cmd
		}
	}
	cmd := exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	if cmd.Start() == nil {
		return cmd
	}
	return nil
}

func browserCandidates() []string {
	var out []string
	for _, base := range []string{os.Getenv("ProgramFiles(x86)"), os.Getenv("ProgramFiles"), os.Getenv("LOCALAPPDATA")} {
		if base == "" {
			continue
		}
		out = append(out,
			filepath.Join(base, "Microsoft", "Edge", "Application", "msedge.exe"),
			filepath.Join(base, "Google", "Chrome", "Application", "chrome.exe"))
	}
	return out
}

func showError(msg string) {
	if !messageBox("سجل الغيابات", msg) {
		fmt.Fprintln(os.Stderr, msg)
	}
}

// Files are saved by the program rather than as browser downloads: browsers drop Arabic names from
// downloaded blobs and save them as "download" without the .docx extension.

const saveFolder = "سجلات الغيابات"

var (
	savedMu sync.Mutex
	saved   = map[string]bool{} // only files this program saved may be opened or revealed
)

// Requests must carry this header; a web page on another site cannot add it without a CORS
// preflight, which this server never grants.
func fromApp(w http.ResponseWriter, r *http.Request) bool {
	if r.Method != http.MethodPost || r.Header.Get("X-Absence") != "1" {
		http.Error(w, "forbidden", http.StatusForbidden)
		return false
	}
	return true
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func handleSave(w http.ResponseWriter, r *http.Request) {
	if !fromApp(w, r) {
		return
	}
	name := filepath.Base(strings.TrimSpace(r.URL.Query().Get("name")))
	if name == "" || name == "." || strings.ContainsAny(name, `\/:*?"<>|`) || !strings.HasSuffix(strings.ToLower(name), ".docx") {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "اسم ملف غير صالح"})
		return
	}
	data, err := io.ReadAll(io.LimitReader(r.Body, 100<<20))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	home, _ := os.UserHomeDir()
	dir := filepath.Join(home, "Downloads", saveFolder)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	path := filepath.Join(dir, name)
	stem := strings.TrimSuffix(name, filepath.Ext(name))
	for i := 2; ; i++ { // never overwrite an earlier register
		if _, err := os.Stat(path); os.IsNotExist(err) {
			break
		}
		path = filepath.Join(dir, fmt.Sprintf("%s (%d).docx", stem, i))
	}
	if err := os.WriteFile(path, data, 0o644); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	savedMu.Lock()
	saved[path] = true
	savedMu.Unlock()
	writeJSON(w, http.StatusOK, map[string]string{"path": path})
}

// handleShell opens a saved file in its default program (Word), or shows it in Explorer.
func handleShell(w http.ResponseWriter, r *http.Request, reveal bool) {
	if !fromApp(w, r) {
		return
	}
	path := r.URL.Query().Get("path")
	savedMu.Lock()
	ok := saved[path]
	savedMu.Unlock()
	if !ok {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "الملف غير موجود"})
		return
	}
	var cmd *exec.Cmd
	if reveal {
		cmd = exec.Command("explorer", "/select,", path)
	} else {
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", path)
	}
	if err := cmd.Start(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	go cmd.Wait()
	writeJSON(w, http.StatusOK, map[string]string{})
}
