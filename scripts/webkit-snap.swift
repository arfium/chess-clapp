// Render a page in WebKit (WKWebView, the engine the Tauri app uses on macOS) and save a PNG.
// usage: [SNAP_AFTER=s] snap <url> <out.png> <width> <height> [js-before-capture] [delay-seconds] [dark]
import Cocoa
import WebKit

let a = CommandLine.arguments
let url = URL(string: a[1])!
let out = a[2]
let w = Double(a[3])!, h = Double(a[4])!
let js = a.count > 5 ? a[5] : ""
let delay = a.count > 6 ? Double(a[6])! : 2.5
let dark = a.count > 7 && a[7] == "dark"
// Seconds to wait between running the script and taking the picture (env SNAP_AFTER).
let after = Double(ProcessInfo.processInfo.environment["SNAP_AFTER"] ?? "") ?? 1.5

let app = NSApplication.shared
app.setActivationPolicy(.prohibited)
let win = NSWindow(contentRect: NSRect(x: -20000, y: -20000, width: w, height: h), styleMask: [.borderless], backing: .buffered, defer: false)
let conf = WKWebViewConfiguration()
// An off-screen page is a hidden page: WebKit throttles its timers and suppresses its process,
// so a long run (a whole Game Review) would crawl. Switch both off where the SPI exists.
for key in ["hiddenPageDOMTimerThrottlingEnabled", "pageVisibilityBasedProcessSuppressionEnabled"] {
  let sel = NSSelectorFromString("_set" + key.prefix(1).uppercased() + key.dropFirst() + ":")
  // Key-value coding finds the `_set…:` setter and unboxes the BOOL; perform(_:with:) would not.
  if conf.preferences.responds(to: sel) { conf.preferences.setValue(false, forKey: key) }
}
let wv = WKWebView(frame: NSRect(x: 0, y: 0, width: w, height: h), configuration: conf)
if dark { wv.appearance = NSAppearance(named: .darkAqua); win.appearance = NSAppearance(named: .darkAqua) }
win.contentView = wv
win.orderBack(nil)
wv.load(URLRequest(url: url))

func capture() {
  wv.takeSnapshot(with: nil) { img, err in
    guard let img = img, let tiff = img.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff),
          let png = rep.representation(using: .png, properties: [:]) else { print("snapshot failed: \(String(describing: err))"); exit(1) }
    try? png.write(to: URL(fileURLWithPath: out))
    print("wrote \(out)")
    exit(0)
  }
}

// Off-screen windows do not run CSS transitions; freeze them so the capture shows end states.
let freeze = "(() => { const s = document.createElement('style'); s.textContent = '*,*::before,*::after{transition:none!important;animation:none!important}'; document.head.appendChild(s); })();"
DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
  wv.evaluateJavaScript(freeze + js) { r, e in
    if let e = e { print("js error: \(e)") } else if let r = r { print("js: \(r)") }
    DispatchQueue.main.asyncAfter(deadline: .now() + after) { capture() }
  }
}
_ = js
app.run()
