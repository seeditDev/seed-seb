import os
import sys
import logging
import http.server
import socketserver
import threading
import time
import random
import requests
import cv2
import psutil
import keyboard
from PyQt6.QtWidgets import (
    QApplication, QMainWindow, QSplashScreen, QMessageBox, 
    QDialog, QVBoxLayout, QHBoxLayout, QPushButton, QLabel, QProgressBar, QWidget
)
from PyQt6.QtCore import QUrl, QEvent, QObject, pyqtSlot, QTimer, Qt, QThread, QSize
from PyQt6.QtGui import QPixmap, QIcon, QKeySequence, QFont
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

# App version
CURRENT_VERSION = "1.0.4"

# Firebase Configuration
FIREBASE_CONFIG = {
    "apiKey": "AIzaSyANO2d-RUXV0x5fvTjRT1UkpssP-T_Qz1Q",
    "authDomain": "daily-tracker-a4092.firebaseapp.com",
    "projectId": "daily-tracker-a4092",
    "storageBucket": "daily-tracker-a4092.firebasestorage.app",
    "messagingSenderId": "1023352927583",
    "appId": "1:1023352927583:web:2f0234b40a448390b6b2ea",
    "measurementId": "G-G9GDW34WTS"
}

# Forbidden background processes to terminate
FORBIDDEN_PROCESSES = [
    # Browsers
    'chrome.exe', 'msedge.exe', 'firefox.exe', 'brave.exe',
    'opera.exe', 'opera_gx.exe', 'vivaldi.exe', 'chromium.exe',
    'iexplore.exe', 'torch.exe', 'maxthon.exe', 'tor.exe', 'tor-browser.exe',
    # Remote Access / Screen Sharing
    'AnyDesk.exe', 'TeamViewer.exe', 'TeamViewer_Service.exe',
    'RustDesk.exe', 'UltraViewer.exe', 'DWAgent.exe',
    'ChromeRemoteDesktop.exe', 'LogMeIn.exe', 'Splashtop.exe',
    'ZohoAssist.exe', 'RemotePC.exe', 'GoToAssist.exe',
    # Messaging / Chat
    'WhatsApp.exe', 'Telegram.exe', 'Signal.exe', 'Viber.exe',
    'WeChat.exe', 'Line.exe', 'KakaoTalk.exe', 'Slack.exe', 'Discord.exe',
    # Video Meetings
    'Teams.exe', 'ms-teams.exe', 'Zoom.exe', 'Skype.exe', 'Webex.exe',
    # IDEs / Code Editors
    'Code.exe', 'code.exe', 'eclipse.exe', 'idea64.exe', 'pycharm64.exe',
    'webstorm64.exe', 'androidstudio.exe', 'netbeans.exe', 'sublime_text.exe',
    'notepad++.exe', 'notepad.exe',
    # AI Tools / Assistants
    'ChatGPT.exe', 'chatgpt.exe', 'Copilot.exe', 'BingChat.exe',
    'Claude.exe', 'Perplexity.exe', 'Replit.exe',
    # Screen Recording / Streaming
    'obs64.exe', 'obs32.exe', 'Streamlabs.exe', 'XSplit.exe', 'Bandicam.exe',
    'Camtasia.exe', 'ShareX.exe', 'Snagit32.exe', 'Snagit64.exe', 'Loom.exe',
    # Virtual Machines / Emulators
    'vmware.exe', 'vmplayer.exe', 'VirtualBox.exe', 'VBoxHeadless.exe',
    'Bluestacks.exe', 'Nox.exe', 'LDPlayer.exe', 'Genymotion.exe'
]


class ReactHTTPHandler(http.server.SimpleHTTPRequestHandler):
    """Custom request handler that serves React build files and falls back to index.html for client routing."""
    def translate_path(self, path):
        translated = super().translate_path(path)
        if not os.path.exists(translated):
            base_dir = self.directory if hasattr(self, 'directory') else os.getcwd()
            if '.' not in os.path.basename(translated):
                return os.path.join(base_dir, "index.html")
        return translated

    def log_message(self, format, *args):
        logging.info("[LocalServer] " + (format % args))


class CustomWebEnginePage(QWebEnginePage):
    """Custom QWebEnginePage to redirect JavaScript console output to Python log file."""
    def javaScriptConsoleMessage(self, level, message, line, source_id):
        logging.info(f"[JS Console] Line {line} ({source_id}): {message}")

    def javaScriptAlert(self, securityOrigin, msg):
        QMessageBox.information(None, "SEED-SEB Assessment Portal", msg)

    def javaScriptConfirm(self, securityOrigin, msg):
        reply = QMessageBox.question(
            None,
            "SEED-SEB Assessment Portal",
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
        event.accept()


class PreLaunchDialog(QDialog):
    """Pre-launch dialog that checks system requirements before starting the secure browser"""
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("SEED-IT Launcher")
        self.setWindowFlags(Qt.WindowType.Dialog | Qt.WindowType.FramelessWindowHint)
        self.setModal(True)
        self.setFixedSize(620, 500)
        
        self.checks_passed = False
        self.version_check_passed = False
        self.camera_check_passed = False
        self.internet_check_passed = False
        
        self.drag_position = None
        self.init_ui()

    def init_ui(self):
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        
        outer_layout = QVBoxLayout(self)
        outer_layout.setContentsMargins(10, 10, 10, 10)
        
        self.main_frame = QFrame = QWidget(self)
        self.main_frame.setObjectName("mainFrame")
        self.main_frame.setStyleSheet("""
            QWidget#mainFrame {
                background-color: #0f172a;
                border: 1px solid #1e293b;
                border-radius: 16px;
            }
        """)
        outer_layout.addWidget(self.main_frame)
        
        layout = QVBoxLayout(self.main_frame)
        layout.setContentsMargins(30, 30, 30, 30)
        layout.setSpacing(18)
        
        # Title
        title_layout = QHBoxLayout()
        logo_label = QLabel("🛡️")
        logo_label.setStyleSheet("font-size: 28px; border: none; background: transparent;")
        
        title = QLabel("SEED-IT Assessment Portal")
        title.setStyleSheet("color: #f8fafc; font-size: 20px; font-weight: bold; border: none; background: transparent;")
        
        title_layout.addStretch()
        title_layout.addWidget(logo_label)
        title_layout.addWidget(title)
        title_layout.addStretch()
        layout.addLayout(title_layout)
        
        # Warning banner
        self.warning_banner = QWidget()
        self.warning_banner.setObjectName("warningBanner")
        self.warning_banner.setStyleSheet("""
            QWidget#warningBanner {
                background-color: rgba(239, 68, 68, 0.1);
                border: 1px solid rgba(239, 68, 68, 0.25);
                border-radius: 8px;
            }
        """)
        warning_layout = QHBoxLayout(self.warning_banner)
        warning_layout.setContentsMargins(14, 12, 14, 12)
        
        warning_text = QLabel("⚠️ <b>System Check:</b> Secure Exam Proctoring is enabled. Background applications, swipe gestures, and system shortcuts will be locked during the assessment.")
        warning_text.setWordWrap(True)
        warning_text.setStyleSheet("color: #fca5a5; font-size: 12px; line-height: 1.4; border: none; background: transparent;")
        warning_layout.addWidget(warning_text)
        layout.addWidget(self.warning_banner)
        
        # Status container
        status_container = QWidget()
        status_container.setObjectName("statusContainer")
        status_container.setStyleSheet("""
            QWidget#statusContainer {
                background-color: #1e293b;
                border: 1px solid #334155;
                border-radius: 12px;
            }
        """)
        status_layout = QVBoxLayout(status_container)
        status_layout.setContentsMargins(20, 18, 20, 18)
        status_layout.setSpacing(14)
        
        self.version_label = QLabel("⏳ Verifying application version...")
        self.version_label.setStyleSheet("color: #94a3b8; font-size: 13px; font-weight: 500; border: none; background: transparent;")
        status_layout.addWidget(self.version_label)
        
        self.camera_label = QLabel("⏳ Checking camera access...")
        self.camera_label.setStyleSheet("color: #94a3b8; font-size: 13px; font-weight: 500; border: none; background: transparent;")
        status_layout.addWidget(self.camera_label)
        
        self.internet_label = QLabel("⏳ Verifying internet connection...")
        self.internet_label.setStyleSheet("color: #94a3b8; font-size: 13px; font-weight: 500; border: none; background: transparent;")
        status_layout.addWidget(self.internet_label)
        
        layout.addWidget(status_container)
        
        # Progress bar
        self.progress_bar = QProgressBar()
        self.progress_bar.setMaximum(3)
        self.progress_bar.setValue(0)
        self.progress_bar.setTextVisible(False)
        self.progress_bar.setStyleSheet("""
            QProgressBar {
                border: none;
                border-radius: 4px;
                background-color: #334155;
                height: 8px;
            }
            QProgressBar::chunk {
                background-color: #6366f1;
                border-radius: 4px;
            }
        """)
        layout.addWidget(self.progress_bar)
        
        # Buttons Row
        buttons_layout = QHBoxLayout()
        buttons_layout.setSpacing(12)
        
        self.close_button = QPushButton("✖ Close")
        self.close_button.setStyleSheet("""
            QPushButton {
                background-color: #334155;
                color: #cbd5e1;
                border: 1px solid #475569;
                border-radius: 8px;
                padding: 10px 20px;
                font-size: 13px;
                font-weight: 600;
            }
            QPushButton:hover {
                background-color: #475569;
                color: #f8fafc;
            }
        """)
        self.close_button.clicked.connect(self.reject)
        
        self.launch_button = QPushButton("🚀 Launch Application")
        self.launch_button.setEnabled(False)
        self.launch_button.setStyleSheet("""
            QPushButton {
                background-color: #475569;
                color: #94a3b8;
                border: none;
                border-radius: 8px;
                padding: 10px 24px;
                font-size: 13px;
                font-weight: 600;
            }
            QPushButton:enabled {
                background-color: #6366f1;
                color: white;
            }
            QPushButton:enabled:hover {
                background-color: #4f46e5;
            }
        """)
        self.launch_button.clicked.connect(self.accept)
        
        buttons_layout.addStretch()
        buttons_layout.addWidget(self.close_button)
        buttons_layout.addWidget(self.launch_button)
        layout.addLayout(buttons_layout)
        
        self.error_label = QLabel("")
        self.error_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.error_label.setStyleSheet("""
            color: #f87171;
            font-size: 12px;
            background-color: rgba(220, 38, 38, 0.1);
            border: 1px solid rgba(220, 38, 38, 0.25);
            padding: 8px 12px;
            border-radius: 6px;
        """)
        self.error_label.hide()
        layout.addWidget(self.error_label)
        
        QTimer.singleShot(500, self.perform_checks)

    def mousePressEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton:
            self.drag_position = event.globalPosition().toPoint() - self.frameGeometry().topLeft()
            event.accept()

    def mouseMoveEvent(self, event):
        if event.buttons() == Qt.MouseButton.LeftButton:
            self.move(event.globalPosition().toPoint() - self.drag_position)
            event.accept()

    def perform_checks(self):
        self.check_internet()
        self.check_camera()
        if self.internet_check_passed:
            self.check_version()
        else:
            self.version_label.setText("❌ <b>Application Version:</b> Check skipped (no internet)")
            self.version_label.setStyleSheet("color: #f87171; font-size: 13px; font-weight: 500; border: none; background: transparent;")
            self.progress_bar.setValue(self.progress_bar.value() + 1)
        self.update_launch_button()

    def check_internet(self):
        try:
            r = requests.get("https://www.google.com", timeout=5)
            if r.status_code == 200:
                self.internet_check_passed = True
                self.internet_label.setText("✅ <b>Internet Connection:</b> Active & Stable")
                self.internet_label.setStyleSheet("color: #10b981; font-size: 13px; font-weight: 500; border: none; background: transparent;")
                self.progress_bar.setValue(self.progress_bar.value() + 1)
            else:
                self.internet_check_passed = False
                self.internet_label.setText("❌ <b>Internet Connection:</b> Limited connection")
                self.internet_label.setStyleSheet("color: #f87171; font-size: 13px; font-weight: 500; border: none; background: transparent;")
        except Exception as e:
            self.internet_check_passed = False
            self.internet_label.setText("❌ <b>Internet Connection:</b> Connection failed")
            self.internet_label.setStyleSheet("color: #f87171; font-size: 13px; font-weight: 500; border: none; background: transparent;")

    def check_camera(self):
        try:
            cap = cv2.VideoCapture(0)
            if cap.isOpened():
                self.camera_check_passed = True
                self.camera_label.setText("✅ <b>Camera Access:</b> Ready & Available")
                self.camera_label.setStyleSheet("color: #10b981; font-size: 13px; font-weight: 500; border: none; background: transparent;")
                self.progress_bar.setValue(self.progress_bar.value() + 1)
                cap.release()
            else:
                self.camera_check_passed = False
                self.camera_label.setText("❌ <b>Camera Access:</b> No camera detected")
                self.camera_label.setStyleSheet("color: #f87171; font-size: 13px; font-weight: 500; border: none; background: transparent;")
        except Exception as e:
            self.camera_check_passed = False
            self.camera_label.setText("❌ <b>Camera Access:</b> Permission denied or error")
            self.camera_label.setStyleSheet("color: #f87171; font-size: 13px; font-weight: 500; border: none; background: transparent;")

    def check_version(self):
        try:
            url = f"https://firestore.googleapis.com/v1/projects/{FIREBASE_CONFIG['projectId']}/databases/(default)/documents/version_seedit"
            response = requests.get(url, params={"key": FIREBASE_CONFIG["apiKey"]}, timeout=10)
            if response.status_code == 200:
                data = response.json()
                documents = data.get("documents", [])
                if documents:
                    doc = documents[0]
                    fields = doc.get("fields", {})
                    version_id = fields.get("versionId", {}).get("stringValue")
                    if version_id:
                        if version_id == CURRENT_VERSION:
                            self.version_check_passed = True
                            self.version_label.setText(f"✅ <b>Application Version:</b> v{CURRENT_VERSION} (Up to date)")
                            self.version_label.setStyleSheet("color: #10b981; font-size: 13px; font-weight: 500; border: none; background: transparent;")
                        else:
                            self.version_check_passed = False
                            self.version_label.setText(f"❌ <b>Application Version:</b> Outdated (v{CURRENT_VERSION} -> v{version_id})")
                            self.version_label.setStyleSheet("color: #f87171; font-size: 13px; font-weight: 500; border: none; background: transparent;")
                            self.show_error(f"Please update application to version {version_id}")
                    else:
                        self.version_check_passed = True
                        self.version_label.setText(f"⚠️ <b>Application Version:</b> v{CURRENT_VERSION} (No remote version config)")
                        self.version_label.setStyleSheet("color: #f59e0b; font-size: 13px; font-weight: 500; border: none; background: transparent;")
                else:
                    self.version_check_passed = True
                    self.version_label.setText(f"⚠️ <b>Application Version:</b> v{CURRENT_VERSION} (No documents found)")
                    self.version_label.setStyleSheet("color: #f59e0b; font-size: 13px; font-weight: 500; border: none; background: transparent;")
            else:
                self.version_check_passed = True
                self.version_label.setText(f"⚠️ <b>Application Version:</b> v{CURRENT_VERSION} (Check bypassed)")
                self.version_label.setStyleSheet("color: #f59e0b; font-size: 13px; font-weight: 500; border: none; background: transparent;")
        except Exception as e:
            self.version_check_passed = True
            self.version_label.setText(f"⚠️ <b>Application Version:</b> v{CURRENT_VERSION} (Check failed)")
            self.version_label.setStyleSheet("color: #f59e0b; font-size: 13px; font-weight: 500; border: none; background: transparent;")
        self.progress_bar.setValue(self.progress_bar.value() + 1)

    def update_launch_button(self):
        # Allow launch if internet and version pass (camera is warning only)
        if self.internet_check_passed and self.version_check_passed:
            self.checks_passed = True
            self.launch_button.setEnabled(True)
            self.launch_button.setText("🚀 Launch Application")
        else:
            self.checks_passed = False
            self.launch_button.setEnabled(False)
            failed = []
            if not self.internet_check_passed:
                failed.append("Internet")
            if not self.version_check_passed:
                failed.append("Version")
            self.launch_button.setText(f"❌ Cannot Launch ({', '.join(failed)} required)")

    def show_error(self, message):
        self.error_label.setText(f"⚠️ {message}")
        self.error_label.show()


class ProcessTerminationThread(QThread):
    """Background daemon thread to continuously terminate unauthorized software (browsers, discord, OBS, VMs etc)"""
    def __init__(self, parent=None):
        super().__init__(parent)
        self.stopped = False

    def stop(self):
        self.stopped = True

    def run(self):
        while not self.stopped:
            for proc in psutil.process_iter(attrs=['pid', 'name']):
                if proc.info['name'] in FORBIDDEN_PROCESSES:
                    try:
                        p = psutil.Process(proc.info['pid'])
                        p.terminate()
                        logging.warning(f"Terminated unauthorized process: {proc.info['name']}")
                    except (psutil.NoSuchProcess, psutil.AccessDenied):
                        pass
            self.sleep(1)


class MainWindow(QMainWindow):
    def __init__(self, dev_mode=False):
        super().__init__()
        self.dev_mode = dev_mode
        self.setWindowTitle("SEED-IT Secure Assessment Portal")
        
        # Configure windowless fullscreen view
        self.setWindowFlags(Qt.WindowType.Window | Qt.WindowType.FramelessWindowHint | Qt.WindowType.WindowStaysOnTopHint)
        screen = QApplication.primaryScreen().geometry()
        self.setGeometry(0, 0, screen.width(), screen.height())

        # Setup focus-loss swipe tracking
        self.focus_loss_count = 0

        # Keep track of local server if running
        self.local_server = None
        self.local_server_port = None
        self.is_loading_fallback = False
        
        # Setup central widget and main layout (Navbar + Webview)
        self.central_widget = QWidget(self)
        self.setCentralWidget(self.central_widget)
        self.main_layout = QVBoxLayout(self.central_widget)
        self.main_layout.setContentsMargins(0, 0, 0, 0)
        self.main_layout.setSpacing(0)

        # Build emergency and navigation controls bar
        self.setup_nav_bar()

        # Setup WebEngine View
        self.web_view = CustomWebEngineView(self)
        self.main_layout.addWidget(self.web_view)
        
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
        
        # Lock keyboard (block Windows keys, Alt gr, Alt, Ctrl, Caps Lock)
        self.block_win_shortcuts()

        # Start background app termination thread
        self.process_terminator = ProcessTerminationThread(self)
        self.process_terminator.start()
        
        # Load content
        self.load_frontend()
        
        # Enable Fullscreen
        self.showFullScreen()
        logging.info("Main Window initialized in secure fullscreen mode")

    def setup_nav_bar(self):
        """Create and style a modern navigation toolbar at the top of the browser view"""
        nav_bar = QWidget()
        nav_bar.setObjectName("navBar")
        nav_bar.setStyleSheet("""
            QWidget#navBar {
                background-color: #0f172a;
                border-bottom: 1px solid #1e293b;
                min-height: 48px;
                max-height: 48px;
            }
            QPushButton {
                background-color: #1e293b;
                color: #cbd5e1;
                border: 1px solid #334155;
                border-radius: 6px;
                padding: 6px 14px;
                margin: 4px;
                font-weight: 600;
                font-size: 13px;
            }
            QPushButton:hover {
                background-color: #334155;
                color: #f8fafc;
                border-color: #475569;
            }
            QPushButton:pressed {
                background-color: #475569;
            }
            QPushButton#logoutBtn {
                background-color: #ef4444;
                color: white;
                border: none;
            }
            QPushButton#logoutBtn:hover {
                background-color: #dc2626;
            }
            QPushButton#forceCloseBtn {
                background-color: #7f1d1d;
                color: #fca5a5;
                border: 1px solid #991b1b;
            }
            QPushButton#forceCloseBtn:hover {
                background-color: #b91c1c;
                color: white;
                border-color: #ef4444;
            }
        """)
        
        nav_layout = QHBoxLayout(nav_bar)
        nav_layout.setContentsMargins(15, 4, 15, 4)
        nav_layout.setSpacing(10)

        # Back / Forward / Refresh buttons
        back_btn = QPushButton("← Back")
        back_btn.clicked.connect(self.web_view.back)
        forward_btn = QPushButton("Forward →")
        forward_btn.clicked.connect(self.web_view.forward)
        refresh_btn = QPushButton("↻ Refresh")
        refresh_btn.clicked.connect(self.web_view.reload)

        # Title Logo
        logo_label = QLabel("🛡️ SEED-IT Secure Portal")
        logo_label.setStyleSheet("color: white; font-weight: bold; font-size: 14px; margin-right: 15px;")

        # Logout & Force Quit Buttons
        logout_btn = QPushButton("🚪 Logout")
        logout_btn.setObjectName("logoutBtn")
        logout_btn.clicked.connect(self.close)

        force_close_btn = QPushButton("☠ Force Close")
        force_close_btn.setObjectName("forceCloseBtn")
        force_close_btn.clicked.connect(self.force_close_application)

        # Add to layout
        nav_layout.addWidget(back_btn)
        nav_layout.addWidget(forward_btn)
        nav_layout.addWidget(refresh_btn)
        nav_layout.addStretch(1)
        nav_layout.addWidget(logo_label)
        nav_layout.addWidget(logout_btn)
        nav_layout.addWidget(force_close_btn)

        self.main_layout.addWidget(nav_bar)

    def block_win_shortcuts(self):
        """Block Windows, Alt, Ctrl, and Caps Lock key hooks to secure exam context"""
        try:
            keyboard.block_key('left windows')
            keyboard.block_key('right windows')
            keyboard.block_key('alt')
            keyboard.block_key('alt gr')
            keyboard.block_key('left ctrl')
            keyboard.block_key('right ctrl')
            keyboard.block_key('caps lock')
            logging.info("Keyboard lock hooks enabled successfully")
        except Exception as e:
            logging.error(f"Failed to enable keyboard hooks: {e}")

    def unblock_win_shortcuts(self):
        """Unblock key hooks on application exit"""
        try:
            keyboard.unblock_key('left windows')
            keyboard.unblock_key('right windows')
            keyboard.unblock_key('alt')
            keyboard.unblock_key('alt gr')
            keyboard.unblock_key('left ctrl')
            keyboard.unblock_key('right ctrl')
            keyboard.unblock_key('caps lock')
            logging.info("Keyboard locks unhooked successfully")
        except Exception as e:
            pass

    def force_close_application(self):
        """Quit immediately without triggering confirmations"""
        logging.info("Force close button clicked. Quitting immediately.")
        self.unblock_win_shortcuts()
        if self.local_server:
            self.local_server.shutdown()
        QApplication.instance().quit()
        sys.exit(0)

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

        self.local_server = socketserver.TCPServer(("127.0.0.1", 0), CustomHTTPHandler)
        self.local_server_port = self.local_server.socket.getsockname()[1]
        
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

    def changeEvent(self, event):
        """Security monitor for window deactivation (workspace swipe/minimize actions). 3 strikes = lockout."""
        if event.type() == QEvent.Type.ActivationChange:
            if not self.isActiveWindow():
                self.focus_loss_count += 1
                logging.warning(f"Security Alert: Sandbox deactivated (Violation {self.focus_loss_count}/3)")
                
                # Instantly force window back to front fullscreen kiosk mode
                self.showFullScreen()
                self.raise_()
                self.activateWindow()
                
                if self.focus_loss_count >= 3:
                    logging.critical("SEED-SEB Lockout: Maximum violations reached.")
                    QMessageBox.critical(
                        self,
                        "Security Violation Lockout",
                        "Security Exception: 3 window focus losses or workspace swipe gestures detected.\nThe assessment has been automatically locked and submitted. Contact your administrator.",
                        QMessageBox.StandardButton.Ok
                    )
                    self.force_close_application()
                else:
                    QMessageBox.warning(
                        self,
                        "Security Warning",
                        f"Security Warning: Swipe gesture or window change detected! (Violation {self.focus_loss_count}/3).\nLeaving the assessment screen is strictly prohibited.",
                        QMessageBox.StandardButton.Ok
                    )
        super().changeEvent(event)

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
            self.unblock_win_shortcuts()
            if self.process_terminator:
                self.process_terminator.stop()
            if self.local_server:
                self.local_server.shutdown()
                self.local_server.server_close()
                logging.info("Local HTTP Server shut down.")
            event.accept()
        else:
            logging.info("Application close prevented.")
            event.ignore()


def main():
    if hasattr(Qt, 'AA_EnableHighDpiScaling'):
        QApplication.setAttribute(Qt.AA_EnableHighDpiScaling, True)
    if hasattr(Qt, 'AA_UseHighDpiPixmaps'):
        QApplication.setAttribute(Qt.AA_UseHighDpiPixmaps, True)

    app = QApplication(sys.argv)
    app.setApplicationName("SEED-SEB")
    
    dev_mode = "--dev" in sys.argv
    
    # 🔹 Show Pre-Launch System Check Dialog first
    prelaunch = PreLaunchDialog()
    result = prelaunch.exec()
    if result != QDialog.DialogCode.Accepted or not prelaunch.checks_passed:
        logging.info("Prelaunch system checks failed or cancelled. Exiting.")
        sys.exit(0)

    # Initialize Main Window
    window = MainWindow(dev_mode=dev_mode)
    window.show()
    sys.exit(app.exec())


if __name__ == "__main__":
    main()
