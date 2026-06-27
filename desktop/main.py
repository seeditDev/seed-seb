import os
import sys
import logging
import http.server
import socketserver
import threading
from PyQt6.QtWidgets import QApplication, QMainWindow, QSplashScreen, QMessageBox
from PyQt6.QtCore import QUrl, QEvent, QObject, pyqtSlot, QTimer, Qt
from PyQt6.QtGui import QPixmap, QIcon, QKeySequence
from PyQt6.QtWebEngineWidgets import QWebEngineView
from PyQt6.QtWebEngineCore import QWebEngineSettings, QWebEngineProfile, QWebEngineScript, QWebEnginePage
from PyQt6.QtWebChannel import QWebChannel

from bridge import DesktopBridge
from runtime_manager import runtime_manager

# Configure logging
log_dir = os.path.join(runtime_manager.app_root, "data", "student")
os.makedirs(log_dir, exist_ok=True)
log_file = os.path.join(log_dir, "app.log")

logging.basicConfig(
    filename=log_file,
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
logging.info("Application starting up...")

class ReactHTTPHandler(http.server.SimpleHTTPRequestHandler):
    """Custom request handler that serves React build files and falls back to index.html for client routing."""
    def translate_path(self, path):
        # Resolve the standard translated path
        translated = super().translate_path(path)
        
        # If the file doesn't exist and has no file extension, redirect to index.html (BrowserRouter fallback)
        if not os.path.exists(translated):
            base_dir = self.directory if hasattr(self, 'directory') else os.getcwd()
            if '.' not in os.path.basename(translated):
                return os.path.join(base_dir, "index.html")
        return translated

    def log_message(self, format, *args):
        # Redirect standard HTTP server access logs to our logging framework
        logging.info("[LocalServer] " + (format % args))

class CustomWebEnginePage(QWebEnginePage):
    """Custom QWebEnginePage to redirect JavaScript console output to Python log file."""
    def __init__(self, parent=None):
        super().__init__(parent)

    def javaScriptConsoleMessage(self, level, message, line, source_id):
        logging.info(f"[JS Console] Line {line} ({source_id}): {message}")

    def javaScriptAlert(self, securityOrigin, msg):
        QMessageBox.information(None, "KITE Assessment Sandbox", msg)

    def javaScriptConfirm(self, securityOrigin, msg):
        reply = QMessageBox.question(
            None,
            "KITE Assessment Sandbox",
            msg,
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
            QMessageBox.StandardButton.No
        )
        return reply == QMessageBox.StandardButton.Yes

class CustomWebEngineView(QWebEngineView):
    """Custom QWebEngineView to block right-clicks and control devtools."""
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setPage(CustomWebEnginePage(self))
        self.settings().setAttribute(QWebEngineSettings.WebAttribute.JavascriptEnabled, True)
        self.settings().setAttribute(QWebEngineSettings.WebAttribute.LocalContentCanAccessRemoteUrls, True)
        self.settings().setAttribute(QWebEngineSettings.WebAttribute.LocalContentCanAccessFileUrls, True)
        self.settings().setAttribute(QWebEngineSettings.WebAttribute.LocalStorageEnabled, True)

    def contextMenuEvent(self, event):
        # Override to disable right-click context menu (security requirement)
        event.accept()

class MainWindow(QMainWindow):
    def __init__(self, dev_mode=False):
        super().__init__()
        self.dev_mode = dev_mode
        self.setWindowTitle("KITE Assessment Sandbox")
        self.resize(1280, 800)
        
        # Keep track of local server if running
        self.local_server = None
        self.local_server_port = None
        self.is_loading_fallback = False
        
        # Setup WebEngine View
        self.web_view = CustomWebEngineView(self)
        self.setCentralWidget(self.web_view)
        
        # Initialize communication channel
        self.channel = QWebChannel()
        self.bridge = DesktopBridge(self)
        self.channel.registerObject("desktopBackend", self.bridge)
        self.web_view.page().setWebChannel(self.channel)
        
        # Connect load finished signal to handle network failure fallbacks
        self.web_view.loadFinished.connect(self.handle_load_finished)
        
        # Load QWebChannel script automatically on every page load
        self.inject_webchannel_script()

        # Keyboard Shortcut Blocker Filter
        self.installEventFilter(self)
        
        # Load content
        self.load_frontend()
        
        # Enable Fullscreen Assessment Mode by default
        self.showMaximized()
        logging.info("Main Window initialized")

    def inject_webchannel_script(self):
        """Injects qwebchannel.js into the pages automatically."""
        script = QWebEngineScript()
        script.setName("qwebchannel")
        script.setSourceCode("""
            if (typeof QWebChannel === 'undefined') {
                var script = document.createElement('script');
                script.src = 'qrc:///qtwebchannel/qwebchannel.js';
                document.head.appendChild(script);
            }
        """)
        script.setInjectionPoint(QWebEngineScript.InjectionPoint.DocumentCreation)
        script.setWorldId(QWebEngineScript.ScriptWorldId.MainWorld)
        script.setRunsOnSubFrames(True)
        self.web_view.page().profile().scripts().insert(script)

    def load_frontend(self):
        """Loads React app from load-balanced Netlify sites, or falls back to local build/server."""
        if self.dev_mode:
            dev_url = "http://localhost:3000"
            logging.info(f"Loading dev server URL: {dev_url}")
            self.web_view.load(QUrl(dev_url))
        else:
            # List of 4 Netlify domains for load balancing
            import random
            netlify_urls = [
                "https://seed-seb-1.netlify.app",
                "https://seed-seb-2.netlify.app",
                "https://seed-seb-3.netlify.app",
                "https://seed-seb-4.netlify.app"
            ]
            
            # Select randomly
            selected_url = random.choice(netlify_urls)
            logging.info(f"Load-balanced selection: {selected_url}")
            
            # Locate build/index.html directory for offline fallback if needed
            build_dir = os.path.join(runtime_manager.app_root, "frontend", "build")
            if not os.path.exists(os.path.join(build_dir, "index.html")):
                build_dir = os.path.join(runtime_manager.app_root, "build")
            
            # Check if we should load the remote url directly (Netlify load-balanced)
            # We will attempt to load the remote URL. If it fails, or if user is offline,
            # we can fallback. For now, let's load the selected Netlify URL.
            logging.info(f"Loading React app from remote: {selected_url}")
            self.web_view.load(QUrl(selected_url))

    def handle_load_finished(self, ok):
        """Callback triggered when page loading finishes. Handles fallback to offline local server on network errors."""
        if not ok and not self.is_loading_fallback and not self.dev_mode:
            logging.warning("Remote Netlify URL failed to load. Attempting offline fallback to local server...")
            self.is_loading_fallback = True
            
            build_dir = os.path.join(runtime_manager.app_root, "frontend", "build")
            if not os.path.exists(os.path.join(build_dir, "index.html")):
                build_dir = os.path.join(runtime_manager.app_root, "build")
                
            if os.path.exists(os.path.join(build_dir, "index.html")):
                try:
                    if not self.local_server:
                        self.start_local_http_server(build_dir)
                    url = f"http://127.0.0.1:{self.local_server_port}/"
                    logging.info(f"Loading local offline fallback server URL: {url}")
                    self.web_view.load(QUrl(url))
                except Exception as e:
                    logging.error(f"Failed to start fallback server: {e}")
                    self.web_view.setHtml(f"<h3>Offline Error</h3><p>Could not connect to online portals and local offline build is not running.</p>")
            else:
                logging.error("Offline fallback failed: React build files not found.")
                self.web_view.setHtml("""
                    <html>
                        <body style="font-family: Arial; padding: 50px; background: #0f172a; color: white; text-align: center;">
                            <h2 style="color: #ef4444;">Network Error / Offline</h2>
                            <p>The remote portal could not be reached and no offline local build is available.</p>
                            <p style="color: #64748b;">Please check your internet connection.</p>
                        </body>
                    </html>
                """)

    def start_local_http_server(self, directory):
        """Spins up a lightweight background daemon HTTP server on a random free port."""
        class CustomHTTPHandler(ReactHTTPHandler):
            def __init__(self, *args, **kwargs):
                super().__init__(*args, directory=directory, **kwargs)

        # Bind to port 0 for random free port assignment
        self.local_server = socketserver.TCPServer(("127.0.0.1", 0), CustomHTTPHandler)
        self.local_server_port = self.local_server.socket.getsockname()[1]
        
        # Start server loop inside daemon thread
        server_thread = threading.Thread(target=self.local_server.serve_forever)
        server_thread.daemon = True
        server_thread.start()
        logging.info(f"Background HTTP server started on port {self.local_server_port} serving {directory}")

    def eventFilter(self, obj, event):
        """Event filter to block exit shortcuts and refresh events."""
        if event.type() == QEvent.Type.KeyPress:
            key = event.key()
            modifiers = event.modifiers()
            
            # Block F5, F11, F12
            if key in [Qt.Key.Key_F5, Qt.Key.Key_F11, Qt.Key.Key_F12]:
                logging.warning(f"Blocked key press: F{key - Qt.Key.Key_F1 + 1}")
                return True
                
            # Block Ctrl+R, Ctrl+Shift+I, Ctrl+Shift+R
            if modifiers & Qt.KeyboardModifier.ControlModifier:
                if key in [Qt.Key.Key_R, Qt.Key.Key_I]:
                    logging.warning(f"Blocked key combination: Ctrl + {chr(key) if key < 128 else key}")
                    return True
                    
            # Block Alt+F4 (prompt close confirmation)
            if modifiers & Qt.KeyboardModifier.AltModifier and key == Qt.Key.Key_F4:
                logging.info("Alt+F4 pressed. Prompting user...")
                self.close()
                return True
                
        return super().eventFilter(obj, event)

    def closeEvent(self, event):
        """Asks for confirmation before quitting the assessment application."""
        reply = QMessageBox.question(
            self,
            "Exit Confirmation",
            "Are you sure you want to exit the assessment sandbox? Your progress will be saved.",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
            QMessageBox.StandardButton.No
        )
        
        if reply == QMessageBox.StandardButton.Yes:
            logging.info("Application closed by student choice.")
            if self.local_server:
                self.local_server.shutdown()
                self.local_server.server_close()
                logging.info("Local HTTP Server shut down.")
            event.accept()
        else:
            logging.info("Application close prevented.")
            event.ignore()

def main():
    app = QApplication(sys.argv)
    app.setApplicationName("KITE Sandbox")
    
    # Parse CLI flags
    dev_mode = "--dev" in sys.argv
    
    # Optional Splash screen (if a splash image is bundled)
    splash_path = os.path.join(runtime_manager.app_root, "resources", "assets", "splash.png")
    splash = None
    if os.path.exists(splash_path):
        pixmap = QPixmap(splash_path)
        splash = QSplashScreen(pixmap, Qt.WindowType.WindowStaysOnTopHint)
        splash.show()
        app.processEvents()
        
    # Initialize Main Window
    window = MainWindow(dev_mode=dev_mode)
    
    # Close splash and show main window
    if splash:
        QTimer.singleShot(1500, lambda: (splash.close(), window.show()))
    else:
        window.show()
        
    sys.exit(app.exec())

if __name__ == "__main__":
    main()
