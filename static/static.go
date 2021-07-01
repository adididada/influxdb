package static

import (
	"embed"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"
	"time"

	platform "github.com/influxdata/influxdb/v2"
)

//go:embed data/*
var data embed.FS

const (
	// defaultFile is the default UI asset file that will be served if no other
	// static asset matches. this is particularly useful for serving content
	// related to a SPA with client-side routing.
	defaultFile = "index.html"

	// embedBaseDir is the prefix for files in the embed.FS - essentially it is
	// the the name of the embedded directory.
	embedBaseDir = "data"

	// uiBaseDir is the directory in embedBaseDir where the built UI assets
	// reside.
	uiBaseDir = "build"

	// swaggerFile is the name of the swagger JSON.
	swaggerFile = "swagger.json"
)

// NewAssetHandler returns an http.Handler to serve files from the provided
// path. If an empty string is provided as the path, the files are served from
// the embedded assets.
func NewAssetHandler(assetsPath string) http.Handler {
	var a http.Handler

	if assetsPath != "" {
		a = assetHandler(os.DirFS(assetsPath), "")
	} else {
		a = assetHandler(data, filepath.Join(embedBaseDir, uiBaseDir))
	}

	return mwSetCacheControl(a)
}

// NewSwagger returns an http.Handler to serve the swaggerFile from the
// embedBaseDir. If the swaggerFile is not found, returns a 404.
func NewSwaggerHandler() http.Handler {
	fn := func(w http.ResponseWriter, r *http.Request) {
		f, err := data.Open(filepath.Join(embedBaseDir, swaggerFile))
		if err != nil {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
		defer f.Close()

		staticFileHandler(f).ServeHTTP(w, r)
	}

	return mwSetCacheControl(http.HandlerFunc(fn))
}

// mwSetCacheControl sets a default cache control header.
func mwSetCacheControl(next http.Handler) http.Handler {
	fn := func(w http.ResponseWriter, r *http.Request) {
		w.Header().Add("Cache-Control", "public, max-age=3600")
		next.ServeHTTP(w, r)
	}
	return http.HandlerFunc(fn)
}

// assetHandler takes an fs.FS and a dir name and returns a handler that either
// serves the file at that path, or the default file if a file cannot be found
// at that path. An empty string can be provided for dir if the files are not
// located in a subdirectory, which is the case when using an --assets-path
// flag.
func assetHandler(fileOpener fs.FS, dir string) http.Handler {
	fn := func(w http.ResponseWriter, r *http.Request) {
		name := strings.TrimPrefix(path.Clean(r.URL.Path), "/")
		// If the root directory is being requested, respond with the default file.
		if name == "" {
			name = defaultFile
		}

		// Try to open the file requested by name, falling back to the default file.
		// If even the default file can't be found, the binary must not have been
		// built with assets, so respond with not found.
		f, err := openAsset(fileOpener, dir, name)
		if err != nil {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
		defer f.Close()

		staticFileHandler(f).ServeHTTP(w, r)
	}

	return http.HandlerFunc(fn)
}

// staticFileHandler takes the provided fs.File and sets the ETag header prior
// to calling http.ServeContent with the contents of the file.
func staticFileHandler(f fs.File) http.Handler {
	fn := func(w http.ResponseWriter, r *http.Request) {
		content, ok := f.(io.ReadSeeker)
		if !ok {
			err := fmt.Errorf("could not open file for reading")
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		i, err := f.Stat()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		modTime, err := modTimeFromInfo(i)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.Header().Set("ETag", etag(i.Size(), modTime))

		// ServeContent will automatically set the content-type header for files
		// from the extension of "name", and will also set the Last-Modified header
		// from the provided time.
		http.ServeContent(w, r, i.Name(), modTime, content)
	}

	return http.HandlerFunc(fn)
}

// openAsset attempts to open the asset by name in the given directory, falling
// back to the default file if the named asset can't be found. Returns an error
// if even the default asset can't be opened.
func openAsset(fileOpener fs.FS, dir, name string) (fs.File, error) {
	f, err := fileOpener.Open(filepath.Join(dir, name))
	if err != nil {
		if os.IsNotExist(err) {
			f, err = fileOpener.Open(filepath.Join(dir, defaultFile))
		}
		if err != nil {
			return nil, err
		}
	}

	return f, nil
}

// modTimeFromInfo gets the modification time from an fs.FileInfo. If this
// modification time is zero (for embedded assets), it falls back to the build
// time for the binary.
func modTimeFromInfo(i fs.FileInfo) (time.Time, error) {
	modTime := i.ModTime()
	var err error
	if modTime.IsZero() {
		modTime, err = time.Parse(time.RFC3339, platform.GetBuildInfo().Date)
	}

	return modTime, err
}

// etag calculates an etag string from the provided file size and
// modification time.
func etag(s int64, mt time.Time) string {
	hour, minute, second := mt.Clock()
	return fmt.Sprintf(`"%d%d%d%d%d"`, s, mt.Day(), hour, minute, second)
}
