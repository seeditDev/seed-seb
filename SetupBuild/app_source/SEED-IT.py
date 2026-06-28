import sys
import warnings
from PyQt6.QtCore import QUrl, Qt, QTimer, QThread, QByteArray, QSize
from PyQt6.QtWidgets import (QApplication, QMainWindow, QVBoxLayout, QWidget, 
                              QFrame, QPushButton, QHBoxLayout, 
                              QLabel, QProgressBar, QMenu, QDialog)
from PyQt6.QtWebEngineWidgets import QWebEngineView
from PyQt6.QtWebEngineCore import (QWebEnginePage, QWebEngineProfile, 
                                   QWebEngineUrlRequestInterceptor, QWebEngineUrlSchemeHandler,
                                   QWebEngineSettings)
from PyQt6.QtGui import QClipboard, QKeySequence, QFont, QShortcut
from PyQt6.QtNetwork import QNetworkCookie
import psutil
import threading
import time
import pygetwindow as gw
import keyboard
import os
import json
import logging
import requests
import cv2
import random
# Suppress PyQt5 deprecation warnings
warnings.filterwarnings("ignore", category=DeprecationWarning)

# Suppress Qt EUDC font warning
os.environ['QT_LOGGING_RULES'] = '*.debug=false;qt.qpa.fonts.warning=false'

# Define cache directories
if sys.platform == 'win32':
    CACHE_DIR = os.path.join(os.getenv('LOCALAPPDATA'), 'SEED-IT', 'cache')
    STORAGE_DIR = os.path.join(os.getenv('LOCALAPPDATA'), 'SEED-IT', 'storage')
    PRECACHE_DIR = os.path.join(os.getenv('LOCALAPPDATA'), 'SEED-IT', 'precache')
else:
    CACHE_DIR = os.path.join(os.path.expanduser('~'), '.cache', 'SEED-IT', 'cache')
    STORAGE_DIR = os.path.join(os.path.expanduser('~'), '.cache', 'SEED-IT', 'storage')
    PRECACHE_DIR = os.path.join(os.path.expanduser('~'), '.cache', 'SEED-IT', 'precache')

# Create directories
for directory in [CACHE_DIR, STORAGE_DIR, PRECACHE_DIR]:
    os.makedirs(directory, exist_ok=True)

# URLs to pre-cache
PRECACHE_URLS = {
    'onecompiler': 'https://onecompiler.com/c/',
    'webskills': 'https://andreasbm.github.io/web-skills/'
}

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

# Current app version
CURRENT_VERSION = "1.0.4"

class PreLaunchDialog(QDialog):
    """Pre-launch dialog that checks system requirements before launching the app"""
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("SEED-IT Launcher")
        
        # Support both PyQt5 and PyQt6 for Window Flags
        if hasattr(Qt, 'WindowType'):
            self.setWindowFlags(Qt.WindowType.Dialog | Qt.WindowType.FramelessWindowHint)
        else:
            self.setWindowFlags(Qt.Dialog | Qt.FramelessWindowHint)
            
        self.setModal(True)
        self.setFixedSize(620, 500)
        
        self.checks_passed = False
        self.version_check_passed = False
        self.camera_check_passed = False
        self.internet_check_passed = False
        
        self.drag_position = None
        self.init_ui()
        
    def init_ui(self):
        """Initialize the pre-launch UI"""
        # Enable translucent background for smooth rounded corners
        if hasattr(Qt, 'WidgetAttribute'):
            self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        else:
            self.setAttribute(Qt.WA_TranslucentBackground)
            
        # Outer layout of the dialog
        outer_layout = QVBoxLayout(self)
        outer_layout.setContentsMargins(10, 10, 10, 10)
        
        # Main background container frame
        self.main_frame = QFrame()
        self.main_frame.setObjectName("mainFrame")
        self.main_frame.setStyleSheet("""
            QFrame#mainFrame {
                background-color: #ffffff;
                border: 1px solid #e2e8f0;
                border-radius: 16px;
            }
        """)
        outer_layout.addWidget(self.main_frame)
        
        # Layout inside the main frame
        layout = QVBoxLayout(self.main_frame)
        layout.setContentsMargins(30, 30, 30, 30)
        layout.setSpacing(18)
        
        # Title Row
        title_layout = QHBoxLayout()
        title_layout.setSpacing(10)
        
        logo_label = QLabel("🛡️")
        logo_label.setStyleSheet("font-size: 26px; border: none; background: transparent;")
        
        title = QLabel("SEED-IT Assessment Portal")
        title_font = QFont()
        title_font.setFamily("Segoe UI")
        title_font.setPointSize(18)
        title_font.setBold(True)
        title.setFont(title_font)
        title.setStyleSheet("color: #0f172a; border: none; background: transparent;")
        
        title_layout.addStretch()
        title_layout.addWidget(logo_label)
        title_layout.addWidget(title)
        title_layout.addStretch()
        layout.addLayout(title_layout)
        
        # Subtitle / Warning banner
        self.warning_banner = QFrame()
        self.warning_banner.setObjectName("warningBanner")
        self.warning_banner.setStyleSheet("""
            QFrame#warningBanner {
                background-color: #fff1f2;
                border: 1px solid #ffe4e6;
                border-radius: 8px;
            }
        """)
        warning_layout = QHBoxLayout(self.warning_banner)
        warning_layout.setContentsMargins(14, 12, 14, 12)
        
        warning_text = QLabel("⚠️ <b>System Check:</b> Please ensure your anti-virus is disabled or configured to trust SEED-IT to prevent blockages during your assessment.")
        warning_text.setWordWrap(True)
        warning_text.setStyleSheet("color: #9f1239; font-size: 12px; line-height: 1.4; border: none; background: transparent;")
        warning_layout.addWidget(warning_text)
        
        layout.addWidget(self.warning_banner)
        
        # Checklist status container
        status_container = QFrame()
        status_container.setObjectName("statusContainer")
        status_container.setStyleSheet("""
            QFrame#statusContainer {
                background-color: #f8fafc;
                border: 1px solid #f1f5f9;
                border-radius: 12px;
            }
        """)
        status_layout = QVBoxLayout(status_container)
        status_layout.setContentsMargins(20, 18, 20, 18)
        status_layout.setSpacing(14)
        
        # Version check status
        self.version_label = QLabel("⏳ Verifying application version...")
        self.version_label.setStyleSheet("color: #64748b; font-size: 13px; font-weight: 500; border: none; background: transparent;")
        status_layout.addWidget(self.version_label)
        
        # Camera check status
        self.camera_label = QLabel("⏳ Checking camera access...")
        self.camera_label.setStyleSheet("color: #64748b; font-size: 13px; font-weight: 500; border: none; background: transparent;")
        status_layout.addWidget(self.camera_label)
        
        # Internet check status
        self.internet_label = QLabel("⏳ Verifying internet connection...")
        self.internet_label.setStyleSheet("color: #64748b; font-size: 13px; font-weight: 500; border: none; background: transparent;")
        status_layout.addWidget(self.internet_label)

        # Dark Mode Feature Notification
        self.dark_mode_label = QLabel("✨ System Feature: Dark Mode integration active")
        self.dark_mode_label.setStyleSheet("color: #0d9488; font-size: 12px; font-weight: 600; border: none; background: transparent;")
        status_layout.addWidget(self.dark_mode_label)
        
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
                background-color: #f1f5f9;
                height: 8px;
            }
            QProgressBar::chunk {
                background-color: #3b82f6;
                border-radius: 4px;
            }
        """)
        layout.addWidget(self.progress_bar)
        
        # Buttons row (Close + Launch)
        buttons_layout = QHBoxLayout()
        buttons_layout.setSpacing(12)

        # Close button
        self.close_button = QPushButton("✖ Close")
        self.close_button.setStyleSheet("""
            QPushButton {
                background-color: #f1f5f9;
                color: #475569;
                border: 1px solid #e2e8f0;
                border-radius: 8px;
                padding: 10px 20px;
                font-size: 13px;
                font-weight: 600;
            }
            QPushButton:hover {
                background-color: #e2e8f0;
                color: #334155;
            }
            QPushButton:pressed {
                background-color: #cbd5e1;
            }
        """)
        self.close_button.clicked.connect(self.reject)

        # Launch button
        self.launch_button = QPushButton("🚀 Launch Application")
        self.launch_button.setEnabled(False)
        self.launch_button.setStyleSheet("""
            QPushButton {
                background-color: #94a3b8;
                color: #ffffff;
                border: none;
                border-radius: 8px;
                padding: 10px 24px;
                font-size: 13px;
                font-weight: 600;
            }
            QPushButton:enabled {
                background-color: #3b82f6;
            }
            QPushButton:enabled:hover {
                background-color: #2563eb;
            }
            QPushButton:enabled:pressed {
                background-color: #1d4ed8;
            }
        """)
        self.launch_button.clicked.connect(self.accept)

        buttons_layout.addStretch()
        buttons_layout.addWidget(self.close_button)
        buttons_layout.addWidget(self.launch_button)
        layout.addLayout(buttons_layout)
        
        # Error label (hidden by default)
        self.error_label = QLabel("")
        self.error_label.setAlignment(Qt.AlignmentFlag.AlignCenter if hasattr(Qt, 'AlignmentFlag') else Qt.AlignCenter)
        self.error_label.setStyleSheet("""
            color: #b91c1c;
            font-size: 12px;
            background-color: #fef2f2;
            border: 1px solid #fee2e2;
            padding: 8px 12px;
            border-radius: 6px;
        """)
        self.error_label.hide()
        layout.addWidget(self.error_label)
        
        # Start checks after UI is shown
        QTimer.singleShot(500, self.perform_checks)
        
    def mousePressEvent(self, event):
        left_button = Qt.MouseButton.LeftButton if hasattr(Qt, 'MouseButton') else Qt.LeftButton
        if event.button() == left_button:
            try:
                global_pos = event.globalPosition().toPoint()
            except AttributeError:
                global_pos = event.globalPos()
            self.drag_position = global_pos - self.frameGeometry().topLeft()
            event.accept()

    def mouseMoveEvent(self, event):
        left_button = Qt.MouseButton.LeftButton if hasattr(Qt, 'MouseButton') else Qt.LeftButton
        if int(event.buttons()) & int(left_button):
            try:
                global_pos = event.globalPosition().toPoint()
            except AttributeError:
                global_pos = event.globalPos()
            self.move(global_pos - self.drag_position)
            event.accept()
            
    def perform_checks(self):
        """Perform all system checks"""
        # Check internet
        self.check_internet()
        
        # Check camera
        self.check_camera()
        
        # Check version (requires internet)
        if self.internet_check_passed:
            self.check_version()
        else:
            self.version_label.setText("❌ <b>Application Version:</b> Check skipped (no internet)")
            self.version_label.setStyleSheet("color: #dc2626; font-size: 13px; font-weight: 500; border: none; background: transparent;")
            self.progress_bar.setValue(self.progress_bar.value() + 1)
            
        # Update final status
        self.update_launch_button()
        
    def check_internet(self):
        """Check internet connectivity"""
        try:
            response = requests.get("https://www.google.com", timeout=5)
            if response.status_code == 200:
                self.internet_check_passed = True
                self.internet_label.setText("✅ <b>Internet Connection:</b> Active & Stable")
                self.internet_label.setStyleSheet("color: #16a34a; font-size: 13px; font-weight: 500; border: none; background: transparent;")
                self.progress_bar.setValue(self.progress_bar.value() + 1)
            else:
                self.internet_check_passed = False
                self.internet_label.setText("❌ <b>Internet Connection:</b> Offline or limited access")
                self.internet_label.setStyleSheet("color: #dc2626; font-size: 13px; font-weight: 500; border: none; background: transparent;")
        except Exception as e:
            self.internet_check_passed = False
            self.internet_label.setText("❌ <b>Internet Connection:</b> Connection failed")
            self.internet_label.setStyleSheet("color: #dc2626; font-size: 13px; font-weight: 500; border: none; background: transparent;")
            
    def check_camera(self):
        """Check camera access"""
        try:
            cap = cv2.VideoCapture(0)
            if cap.isOpened():
                self.camera_check_passed = True
                self.camera_label.setText("✅ <b>Camera Access:</b> Ready & Available")
                self.camera_label.setStyleSheet("color: #16a34a; font-size: 13px; font-weight: 500; border: none; background: transparent;")
                self.progress_bar.setValue(self.progress_bar.value() + 1)
                cap.release()
            else:
                self.camera_check_passed = False
                self.camera_label.setText("❌ <b>Camera Access:</b> No camera detected")
                self.camera_label.setStyleSheet("color: #dc2626; font-size: 13px; font-weight: 500; border: none; background: transparent;")
        except Exception as e:
            self.camera_check_passed = False
            self.camera_label.setText("❌ <b>Camera Access:</b> Permission denied or error")
            self.camera_label.setStyleSheet("color: #dc2626; font-size: 13px; font-weight: 500; border: none; background: transparent;")
            self.show_error(f"Camera check failed: {str(e)}")
            
    def check_version(self):
        """Check version from Firebase Firestore (collection: version_seedit, field: versionId)"""
        try:
            # IMPORTANT: name must exactly match your collection name in Firestore
            firebase_url = (
                f"https://firestore.googleapis.com/v1/projects/"
                f"{FIREBASE_CONFIG['projectId']}/databases/(default)/documents/version_seedit"
            )

            response = requests.get(
                firebase_url,
                params={"key": FIREBASE_CONFIG["apiKey"]},
                timeout=10
            )

            if response.status_code == 200:
                data = response.json()
                documents = data.get("documents", [])

                if documents:
                    # Take the first document in the collection
                    doc = documents[0]
                    fields = doc.get("fields", {})
                    version_id = fields.get("versionId", {}).get("stringValue")

                    if version_id:
                        if version_id == CURRENT_VERSION:
                            # Up to date
                            self.version_check_passed = True
                            self.version_label.setText(
                                f"✅ <b>Application Version:</b> v{CURRENT_VERSION} (Up to date)"
                            )
                            self.version_label.setStyleSheet(
                                "color: #16a34a; font-size: 13px; font-weight: 500; border: none; background: transparent;"
                            )
                        else:
                            # Version mismatch
                            self.version_check_passed = False
                            self.version_label.setText(
                                f"❌ <b>Application Version:</b> Outdated (v{CURRENT_VERSION} -> v{version_id})"
                            )
                            self.version_label.setStyleSheet(
                                "color: #dc2626; font-size: 13px; font-weight: 500; border: none; background: transparent;"
                            )
                            self.show_error(f"Please update to version {version_id}")
                    else:
                        # Field missing – treat as no remote version
                        self.version_check_passed = True
                        self.version_label.setText(
                            f"⚠️ <b>Application Version:</b> v{CURRENT_VERSION} (versionId field missing)"
                        )
                        self.version_label.setStyleSheet(
                            "color: #ea580c; font-size: 13px; font-weight: 500; border: none; background: transparent;"
                        )
                else:
                    # No documents in collection – treat as no remote control
                    self.version_check_passed = True
                    self.version_label.setText(
                        f"⚠️ <b>Application Version:</b> v{CURRENT_VERSION} (no remote document found)"
                    )
                    self.version_label.setStyleSheet(
                        "color: #ea580c; font-size: 13px; font-weight: 500; border: none; background: transparent;"
                    )
            else:
                # HTTP error – soft fail (let app start but warn)
                self.version_check_passed = True
                self.version_label.setText(
                    f"⚠️ <b>Application Version:</b> v{CURRENT_VERSION} (check failed: {response.status_code})"
                )
                self.version_label.setStyleSheet(
                    "color: #ea580c; font-size: 13px; font-weight: 500; border: none; background: transparent;"
                )

        except Exception as e:
            # Network/parse error – soft fail (warn only)
            self.version_check_passed = True
            self.version_label.setText(
                f"⚠️ <b>Application Version:</b> v{CURRENT_VERSION} (check failed)"
            )
            self.version_label.setStyleSheet(
                "color: #ea580c; font-size: 13px; font-weight: 500; border: none; background: transparent;"
            )
            print(f"Version check error: {e}")

        # ✅ Always advance the progress bar once this check is done
        self.progress_bar.setValue(self.progress_bar.value() + 1)
     
    def update_launch_button(self):
        """Update the launch button based on check results"""
        if self.internet_check_passed and self.version_check_passed:#self.camera_check_passed
            self.checks_passed = True
            self.launch_button.setEnabled(True)
            self.launch_button.setText("🚀 Launch Application")
        else:
            self.checks_passed = False
            self.launch_button.setEnabled(False)
            failed_checks = []
            if not self.internet_check_passed:
                failed_checks.append("Internet")
            if not self.camera_check_passed:
                failed_checks.append("Camera")
            if not self.version_check_passed:
                failed_checks.append("Version")

            self.launch_button.setText(f"❌ Cannot Launch ({', '.join(failed_checks)} required)")
            
    def show_error(self, message):
        """Show error message"""
        self.error_label.setText(f"⚠️ {message}")
        self.error_label.show()


# [Copy ALL remaining original classes and methods from lines 44-1591 here]
# ProcessTerminationThread, WebEnginePage, and SecureWebBrowser classes remain unchanged


class ProcessTerminationThread(QThread):
    def __init__(self, process_names, parent=None):
        super().__init__(parent)
        self.process_names = process_names
        self.stopped = False

    def stop(self):
        self.stopped = True

    def run(self):
        while not self.stopped:
            for name in self.process_names:
                for proc in psutil.process_iter(attrs=['pid', 'name']):
                    if proc.info['name'] == name:
                        try:
                            process = psutil.Process(proc.info['pid'])
                            process.terminate()
                        except psutil.NoSuchProcess:
                            pass
            self.sleep(1)  # Sleep for 1 second between checks

class WebEnginePage(QWebEnginePage):
    def __init__(self, profile, parent=None):
        super().__init__(profile, parent)
        self.loadFinished.connect(self.handle_load_finished)
        self.precache_completed = False
        self.featurePermissionRequested.connect(self.on_feature_permission_requested)
        
        # ---- AUTO GRANT PERMISSIONS (CAMERA / MIC / SCREEN) ----
    def on_feature_permission_requested(self, securityOrigin, feature):
        print("⚠ Feature requested:", feature, "from", securityOrigin.toString())

        if feature == QWebEnginePage.Feature.MediaVideoCapture:
            print("🎥 Granting CAMERA permission automatically")
            self.setFeaturePermission(securityOrigin, feature, QWebEnginePage.PermissionPolicy.PermissionGrantedByUser)
            return

        if feature == QWebEnginePage.Feature.MediaAudioCapture:
            print("🎤 Granting MICROPHONE permission automatically")
            self.setFeaturePermission(securityOrigin, feature, QWebEnginePage.PermissionPolicy.PermissionGrantedByUser)
            return

        if feature == QWebEnginePage.Feature.DesktopVideoCapture:
            print("🖥 Granting SCREEN CAPTURE permission")
            self.setFeaturePermission(securityOrigin, feature, QWebEnginePage.PermissionPolicy.PermissionGrantedByUser)
            return

        self.setFeaturePermission(securityOrigin, feature, QWebEnginePage.PermissionPolicy.PermissionDeniedByUser)

    def javaScriptConsoleMessage(self, level, message, lineNumber, sourceID):
        levels = {0: 'INFO', 1: 'WARNING', 2: 'ERROR'}
        level_name = levels.get(level, 'INFO')
        print(f"JavaScript {level_name}: {message} at line {lineNumber} in {sourceID}")

    def handle_load_finished(self, ok):
        if ok and not self.precache_completed:
            current_url = self.url().toString()
            if "seedit.site/student/dashboard" in current_url:
                self.inject_precache_script()

    def inject_precache_script(self):
        script = """
        // Function to pre-cache iframe content
        async function precacheIframeContent() {
            const iframes = document.querySelectorAll('iframe');
            for (const iframe of iframes) {
                const src = iframe.getAttribute('src');
                if (src && (src.includes('onecompiler.com') || src.includes('web-skills'))) {
                    try {
                        const response = await fetch(src);
                        const content = await response.text();
                        // Store in localStorage for faster access
                        localStorage.setItem(`precache_${src}`, content);
                        console.log('Pre-cached content for:', src);
                    } catch (error) {
                        console.error('Error pre-caching:', src, error);
                    }
                }
            }
        }

        // Monitor for iframe additions
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.addedNodes.length) {
                    precacheIframeContent();
                }
            });
        });

        // Start observing
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // Initial pre-cache
        precacheIframeContent();
        """
        self.runJavaScript(script)
        self.precache_completed = True

class SecureWebBrowser(QMainWindow):
    def __init__(self):
        super().__init__()
        # Set the random domain at the very start
        self.seed_base_url = random.choice([
            "https://www.seedit.site",
            "https://seedlearn1.netlify.app",
            "https://seedlearn2.netlify.app",
            "https://seedlearn3.netlify.app"
        ])
        
        # Initialize authentication flag
        self.logged_in_to_hackerrank = False
        
        # Add flag to track initial load
        self.initial_load = True
        
        # Initialize current assessment URL
        self.current_assessment_url = None
        
        # User profile information
        self.username = "SEED-IT User"
        self.college_name = "SEED Institute of Training"
        self.roll_number = "N/A"
        
        # Add a flag to track redirection from HackerRank
        self.redirecting_from_hackerrank = False
        
        # Add flag to track if initial loading is complete
        self.initial_loading = True
        
        # Create overlay frame at the beginning to avoid resize event issues
        self.overlay_frame = QFrame(self)
        self.overlay_frame.setStyleSheet("""
            background-color: rgba(255, 255, 255, 1.0);
            border-top: 3px solid #4CAF50;
            border-bottom: 3px solid #4CAF50;
        """)
        self.overlay_frame.hide()  # Hidden by default
        
        # Create loading overlay with improved styling
        self.loading_overlay = QFrame(self)
        self.loading_overlay.setStyleSheet("""
            QFrame {
                background-color: rgba(0, 0, 0, 0.8);
                border: none;
            }
            QLabel {
                color: white;
                font-size: 24px;
                font-weight: bold;
                padding: 20px;
            }
            QProgressBar {
                border: 2px solid #4CAF50;
                border-radius: 7px;
                text-align: center;
                background-color: #2c3e50;
                min-width: 300px;
                max-width: 300px;
                height: 25px;
            }
            QProgressBar::chunk {
                background-color: #4CAF50;
                width: 20px;
                margin: 0.5px;
                border-radius: 3px;
            }
        """)
        
        # Create layout for loading overlay
        loading_layout = QVBoxLayout(self.loading_overlay)
        loading_layout.setAlignment(Qt.AlignmentFlag.AlignCenter)
        
        # Add loading spinner with animation
        self.loading_progress = QProgressBar()
        self.loading_progress.setMinimum(0)
        self.loading_progress.setMaximum(0)  # Makes it an "infinite" spinner
        self.loading_progress.setFixedSize(QSize(300, 25))
        self.loading_progress.setTextVisible(False)
        
        # Add loading text with more detail
        self.loading_label = QLabel("Loading page...\nPlease wait")
        self.loading_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        
        # Add widgets to layout with spacing
        loading_layout.addWidget(self.loading_label, alignment=Qt.AlignmentFlag.AlignCenter)
        loading_layout.addSpacing(20)  # Add space between label and progress bar
        loading_layout.addWidget(self.loading_progress, alignment=Qt.AlignmentFlag.AlignCenter)
        
        # Hide overlay initially
        self.loading_overlay.hide()
        
        # First, initialize the UI which will create the browser
        self.init_ui()
        
        # Initialize dark mode state
        self.is_dark_mode = False
        
        # Now that the browser exists, we can safely connect signals and perform other operations
        
        # Connect URL changed signal
        self.browser.urlChanged.connect(self.on_url_changed)
        
        # Connect load finished signal to ensure overlay visibility
        self.browser.loadFinished.connect(self.on_page_load_finished)
        
        
        
        # Setup other things after clearing
        self.setup_monitoring()
        self.block_win_shortcuts()
        
        # Add network status monitoring
        self.network_timer = QTimer(self)
        self.network_timer.timeout.connect(self.check_network_status)
        self.network_timer.start(30000)  # Check every 30 seconds

        # Add session timeout monitoring
        self.session_timeout = 3600  # 1 hour in seconds
        self.last_activity_time = time.time()
        
        # Start session monitor
        self.session_timer = QTimer(self)
        self.session_timer.timeout.connect(self.check_session_timeout)
        self.session_timer.start(60000)  # Check every minute

        # Optimize performance
        self.setMinimumSize(800, 600)  # Set minimum window size
        self.browser.setZoomFactor(1.0)  # Set default zoom
        
        # Enable hardware acceleration
        os.environ['QTWEBENGINE_CHROMIUM_FLAGS'] = '--enable-gpu-rasterization --enable-zero-copy'

        # Setup logging
        self.setup_logging()

    def setup_logging(self):
        """Setup structured logging"""
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(levelname)s - %(message)s',
            handlers=[
                logging.FileHandler('seed-it.log'),
                logging.StreamHandler()
            ]
        )
        self.logger = logging.getLogger('SEED-IT')

    def init_ui(self):
        try:
            # Create main window
            self.setWindowTitle(" SEED-IT ")
            
            # Remove window frame and set fullscreen
            self.setWindowFlags(Qt.WindowType.Window | Qt.WindowType.FramelessWindowHint)
            screen = QApplication.primaryScreen().geometry()
            self.setGeometry(0, 0, screen.width(), screen.height())
            
            # Start maximized
            self.showMaximized()
            
            # Add shortcuts for emergency exit (F11 for toggling fullscreen, Esc for exit)
            self.exit_shortcut = QShortcut(QKeySequence("Ctrl+Q"), self)
            self.exit_shortcut.activated.connect(self.exit_application)
            
            self.toggle_fullscreen_shortcut = QShortcut(QKeySequence("F11"), self)
            self.toggle_fullscreen_shortcut.activated.connect(self.toggle_fullscreen)

            # Create central widget and layout
            central_widget = QWidget()
            self.setCentralWidget(central_widget)
            main_layout = QVBoxLayout(central_widget)
            main_layout.setContentsMargins(0, 0, 0, 0)
            main_layout.setSpacing(0)

            # Store a reference to the profile to prevent premature garbage collection
            self.profile = QWebEngineProfile("SEED-IT")
            self.profile.setHttpCacheType(QWebEngineProfile.HttpCacheType.DiskHttpCache)
            self.profile.setCachePath(CACHE_DIR)
            self.profile.setPersistentStoragePath(STORAGE_DIR)
            self.profile.setPersistentCookiesPolicy(QWebEngineProfile.PersistentCookiesPolicy.AllowPersistentCookies)
            self.profile.setHttpCacheMaximumSize(1024 * 1024 * 1024)  # 1GB cache size

            # Create and setup web view with custom page
            self.browser = QWebEngineView()
            self.page = WebEnginePage(self.profile, self)
            self.browser.setPage(self.page)
            
            # ✅ Clear cache/cookies BEFORE we load the first URL
            # self.clear_browser_data()

            # Connect load finished signal to ensure overlay stays visible after page loads
            self.browser.loadFinished.connect(self.on_page_load_finished)
            
            # Configure web settings for better compatibility
            settings = self.browser.settings()
            settings.setAttribute(QWebEngineSettings.WebAttribute.AutoLoadImages, True)
            settings.setAttribute(QWebEngineSettings.WebAttribute.JavascriptEnabled, True)
            settings.setAttribute(QWebEngineSettings.WebAttribute.LocalContentCanAccessFileUrls, False)
            settings.setAttribute(QWebEngineSettings.WebAttribute.LocalStorageEnabled, True)
            settings.setAttribute(QWebEngineSettings.WebAttribute.AllowRunningInsecureContent, False)  # More secure
            settings.setAttribute(QWebEngineSettings.WebAttribute.AllowGeolocationOnInsecureOrigins, False)  # More secure

            # Connect loading signals with better handling
            self.browser.loadStarted.connect(self.show_loading_overlay)
            self.browser.loadFinished.connect(lambda ok: self.hide_loading_overlay(ok))
            self.browser.loadProgress.connect(self.update_loading_progress)
            
            # Set default zoom factor
            self.browser.setZoomFactor(1.0)
            
            # Create navigation bar widget
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
                QPushButton#logoutBtn:pressed {
                    background-color: #b91c1c;
                }
                QPushButton#logoutBtn:disabled {
                    background-color: #1e293b;
                    color: #475569;
                    border: 1px solid #334155;
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
                QPushButton#forceCloseBtn:pressed {
                    background-color: #991b1b;
                }
                QPushButton#endAssessBtn {
                    background-color: #f97316;
                    color: white;
                    border: none;
                }
                QPushButton#endAssessBtn:hover {
                    background-color: #ea580c;
                }
                QPushButton#endAssessBtn:pressed {
                    background-color: #c2410c;
                }
                QPushButton#questionsBtn {
                    background-color: #10b981;
                    color: white;
                    border: none;
                }
                QPushButton#questionsBtn:hover {
                    background-color: #059669;
                }
                QPushButton#questionsBtn:pressed {
                    background-color: #047857;
                }
                QPushButton#darkModeBtn {
                    background-color: #1e293b;
                    color: #cbd5e1;
                    border: 1px solid #334155;
                }
                QPushButton#darkModeBtn:hover {
                    background-color: #334155;
                    color: #f8fafc;
                }
                QLabel {
                    color: #ffffff;
                    font-size: 14px;
                    font-weight: 700;
                    padding: 0 10px;
                    background: transparent;
                    border: none;
                }
            """)
            nav_layout = QHBoxLayout(nav_bar)
            nav_layout.setContentsMargins(10, 8, 10, 8)
            
            # Create navigation buttons
            back_button = QPushButton("← Back")
            forward_button = QPushButton("Forward →")
            refresh_button = QPushButton("↻ Refresh")
            questions_button = QPushButton("📝 Questions")
            questions_button.setObjectName("questionsBtn")
            end_assessment_button = QPushButton("⚠ End Assessment")
            end_assessment_button.setObjectName("endAssessBtn")
            logout_button = QPushButton("🚪 Logout")
            logout_button.setObjectName("logoutBtn")
            force_close_button = QPushButton("☠ Force Close")
            force_close_button.setObjectName("forceCloseBtn")
            dark_mode_button = QPushButton("🌙")
            dark_mode_button.setObjectName("darkModeBtn")
            
            # Hide questions, end assessment, and dark mode buttons by default (will show when on HackerRank domain)
            questions_button.hide()
            end_assessment_button.hide()
            dark_mode_button.hide()
            
            # Add buttons to navigation bar
            nav_layout.addWidget(back_button)
            nav_layout.addWidget(forward_button)
            nav_layout.addWidget(refresh_button)
            nav_layout.addWidget(questions_button)
            nav_layout.addWidget(end_assessment_button)
            nav_layout.addStretch(1)  # Push logout button to the right
            
            # Add SEED-IT logo and text for branding
            logo_label = QLabel(" SEED-IT ")
            logo_label.setStyleSheet("""
                font-size: 16px;
                font-weight: bold;
                color: white;
                margin-right: 10px;
            """)
            nav_layout.addWidget(logo_label)
            nav_layout.addWidget(dark_mode_button)
            nav_layout.addWidget(logout_button)
            nav_layout.addWidget(force_close_button)
            
            # Store references to buttons for later use
            self.questions_button = questions_button
            self.end_assessment_button = end_assessment_button
            self.logout_button = logout_button  # Store reference to logout button
            self.dark_mode_button = dark_mode_button

            
            # Connect button signals to slots
            back_button.clicked.connect(self.browser.back)
            forward_button.clicked.connect(self.browser.forward)
            refresh_button.clicked.connect(self.browser.reload)
            questions_button.clicked.connect(self.go_to_challenges_page)
            end_assessment_button.clicked.connect(self.handle_end_assessment)
            logout_button.clicked.connect(self.exit_application)
            force_close_button.clicked.connect(self.force_close_application)
            dark_mode_button.clicked.connect(self.toggle_dark_mode)

            
            # Add navigation bar to main layout
            main_layout.addWidget(nav_bar)
            
            # Calculate estimated navigation bar height for overlay positioning
            nav_bar_height = 50  # Height of the main navigation bar
            additional_offset = 0  # Adjust this value to move overlay up (smaller value) or down (larger value)
            
            # Configure the overlay frame that was created in __init__
            overlay_layout = QHBoxLayout(self.overlay_frame)
            overlay_layout.setContentsMargins(15, 0, 15, 0)
            
            # Add user profile information to the overlay
            self.name_label = QLabel()
            self.name_label.setAlignment(Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignVCenter)
            self.name_label.setStyleSheet("""
                padding: 0;
                background: transparent;
                border: none;
            """)
            
            # Add the label to the overlay layout
            overlay_layout.addWidget(self.name_label)
            
            # Initialize layout, geometry, and contents dynamically
            self.update_overlay_layout_and_geometry()
            
            # Use the selected domain for the login page
            self.browser.setUrl(QUrl(self.seed_base_url + "/login"))
            self.browser.setContextMenuPolicy(Qt.ContextMenuPolicy.NoContextMenu)
            
            # Set web view to fill the remaining space
            self.browser.setMinimumSize(screen.width(), screen.height() - nav_bar.sizeHint().height())
            main_layout.addWidget(self.browser)

            # Additional security settings - use only supported attributes
            settings = self.browser.settings()
            settings.setAttribute(QWebEngineSettings.WebAttribute.AutoLoadImages, True)
            settings.setAttribute(QWebEngineSettings.WebAttribute.JavascriptEnabled, True)
            settings.setAttribute(QWebEngineSettings.WebAttribute.LocalContentCanAccessFileUrls, False)
            settings.setAttribute(QWebEngineSettings.WebAttribute.LocalStorageEnabled, True)
            settings.setAttribute(QWebEngineSettings.WebAttribute.AllowRunningInsecureContent, False)
            settings.setAttribute(QWebEngineSettings.WebAttribute.AllowGeolocationOnInsecureOrigins, False)
        except Exception as e:
            print(f"❌ Error initializing UI: {e}")
            self.show_error_message("Failed to initialize application. Please restart.")

    def setup_monitoring(self):
        # Start dialog monitoring
        self.dialog_monitor_thread = threading.Thread(target=self.monitor_dialogs)
        self.dialog_monitor_thread.daemon = True
        self.dialog_monitor_thread.start()

        # Start clipboard monitoring
        self.clipboard_timer = QTimer(self)
        self.clipboard_timer.timeout.connect(self.clear_clipboard)
        self.clipboard_timer.start(1000)

    def monitor_dialogs(self):
        while True:
            try:
                windows = gw.getAllWindows()
                for window in windows:
                    title = window.title.lower()
                    if any(term in title for term in ['save', 'print', 'download', 'upload']):
                        try:
                            window.close()
                        except:
                            pass
                time.sleep(1)
            except:
                continue

    def clear_clipboard(self):
        QApplication.clipboard().clear()

    def force_close_application(self):
        """Force close the application immediately"""
        print("☠ Force Close button clicked - Terminating immediately...")
        # Unblock shortcuts just in case, though we are exiting immediately
        try:
            self.unblock_win_shortcuts()
        except:
            pass
            
        # Hard exit
        QApplication.instance().quit()
        sys.exit(0)

    def toggle_dark_mode(self):
        """Toggle dark mode for the application"""
        self.is_dark_mode = not self.is_dark_mode
        
        if self.is_dark_mode:
            self.dark_mode_button.setText("☀")
            print("🌙 Switching to Dark Mode")
            script = """
            (function() {
                // Create a style element if it doesn't exist
                let style = document.getElementById('seed-it-dark-mode');
                if (!style) {
                    style = document.createElement('style');
                    style.id = 'seed-it-dark-mode';
                    document.head.appendChild(style);
                }
                // Apply dark mode CSS
                style.textContent = `
                    html { filter: invert(0.9) hue-rotate(180deg) !important; }
                    img, video, iframe, canvas { filter: invert(1) hue-rotate(180deg) !important; }
                `;
            })();
            """
        else:
            self.dark_mode_button.setText("🌙")
            print("☀ Switching to Light Mode")
            script = """
            (function() {
                let style = document.getElementById('seed-it-dark-mode');
                if (style) {
                    style.remove();
                }
            })();
            """
            
        self.browser.page().runJavaScript(script)

    def exit_application(self):
        """Handle application exit, clear all data and properly exit"""
        print("Logout button clicked, clearing all data...")
        
        # Get current URL
        current_url = self.browser.url().toString()
        
        # Only proceed with exit if we're on the login page of the selected domain
        if self.seed_base_url + "/login" in current_url.lower():
            # Clear all storage and cookies
            self.browser.page().runJavaScript(
                '''
                try {
                    // Clear all storage
                    localStorage.clear();
                    sessionStorage.clear();
                    
                    // Clear all cookies
                    const cookies = document.cookie.split(";");
                    for (let i = 0; i < cookies.length; i++) {
                        const cookie = cookies[i];
                        const eqPos = cookie.indexOf("=");
                        const name = eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim();
                        document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
                        document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=.hackerrank.com";
                        document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=.seedit.site";
                    }
                    
                    console.log("✅ Cleared all storage and cookies");
                    return true;
                } catch (e) {
                    console.error("❌ Error clearing data:", e);
                    return false;
                }
                '''
            )
            
            # Clear browser cache and cookies through PyQt
            self.browser.page().profile().clearHttpCache()
            self.browser.page().profile().cookieStore().deleteAllCookies()
            
            # Force the browser to a blank page to prevent any pending callbacks
            self.browser.setUrl(QUrl("about:blank"))
            
            # Unblock keyboard shortcuts before closing
            try:
                self.unblock_win_shortcuts()
                print("✅ Unblocked keyboard shortcuts")
            except Exception as e:
                print(f"⚠️ Warning: Error unblocking shortcuts: {e}")
            
            # Close the application
            self.close()
        else:
            print("⚠️ Logout button clicked but not on login page - ignoring")

    def block_win_shortcuts(self):
        keyboard.block_key('left windows')
        keyboard.block_key('right windows')
        keyboard.block_key('alt')
        keyboard.block_key('alt gr')
        keyboard.block_key('left ctrl')
        keyboard.block_key('right ctrl')
        keyboard.block_key('caps lock')

    def unblock_win_shortcuts(self):
        """Safely unblock keyboard shortcuts"""
        try:
            keyboard.unblock_key('left windows')
            keyboard.unblock_key('right windows')
            keyboard.unblock_key('alt')
            keyboard.unblock_key('alt gr')
            keyboard.unblock_key('left ctrl')
            keyboard.unblock_key('right ctrl')
            keyboard.unblock_key('caps lock')
        except Exception as e:
            print(f"Warning: Could not unblock some keyboard shortcuts: {e}")
            # Ignore errors - it's okay if some keys weren't blocked

    def clear_browser_data(self):
        """Enhanced browser cleanup"""
        try:
            # Clear existing data
            self.browser.page().profile().clearHttpCache()
            self.browser.page().profile().cookieStore().deleteAllCookies()
            
            # Force garbage collection
            import gc
            gc.collect()
            
        except Exception as e:
            print(f"❌ Error clearing browser data: {e}")

    def on_url_changed(self, url):
        # Get the URL as a string
        url_str = url.toString()

        # Force HackerRank contest challenge problem page to open in fullscreen mode
        if "hackerrank.com/contests/" in url_str and "/challenges/" in url_str and "/problem" in url_str:
            if "isFullScreen=true" not in url_str:
                separator = "&" if "?" in url_str else "?"
                fullscreen_url = url_str + separator + "isFullScreen=true"
                print(f"🔄 Redirecting to HackerRank fullscreen mode: {fullscreen_url}")
                self.browser.setUrl(QUrl(fullscreen_url))
                return

        # Handle empty or about:blank URLs by redirecting to the selected domain's login
        if not url_str or url_str == "about:blank":
            print("⚠️ Empty URL detected, redirecting to SEED-IT login...")
            self.browser.setUrl(QUrl(self.seed_base_url + "/login"))
            return

        print(f"URL changed to: {url_str}")  # Debug print
        
        # Update logout button state based on URL
        if self.seed_base_url + "/login" in url_str.lower():
            print("🔓 On login page, enabling logout button")
            self.logout_button.setEnabled(True)
        else:
            print("🔒 Not on login page, disabling logout button")
            self.logout_button.setEnabled(False)
        
        # If we're on our app domain, fetch and store user data
        if self.seed_base_url in url_str and not self.redirecting_from_hackerrank:
                self.browser.page().runJavaScript(
                    '''
                (function() {
                    try {
                        // Get user data from auth_data in localStorage on our domain
                        const authData = JSON.parse(localStorage.getItem("auth_data") || "{}");
                        console.log("Extracted auth_data:", JSON.stringify(authData));
                        return {
                            name: authData.Name || "SEED-IT User",
                            college: authData.College || "SEED Institute of Training",
                            roll: authData["Roll Number"] || "N/A"
                        };
                    } catch (e) {
                        console.error("Error getting user data:", e);
                        return null;
                    }
                })();
                ''',
                self.store_user_data
            )
        
        # Check if this is the initial load of the login page
        if (self.seed_base_url + "/login" in url_str.lower() or "/Login" in url_str):
            if self.initial_load:
                print("🚀 Initial load of login page, not closing...")
                self.initial_load = False
                return
            elif not self.logged_in_to_hackerrank:
                # If we haven't been logged in to HackerRank yet, don't close
                print("🔒 No previous HackerRank login, not closing...")
                return

        # Check if we are redirecting from HackerRank
        if self.redirecting_from_hackerrank:
            # Don't hide the overlay yet - let the page load finish handler do that
            print("🚀 Currently redirecting from HackerRank, keeping overlay visible...")
        # Show overlay in two scenarios:
        # 1. On HackerRank contest pages
        # 2. On any authenticated HackerRank page (except login)
        elif ("hackerrank.com/contests/" in url_str or 
            ("hackerrank.com/" in url_str and "hackerrank.com/auth/login" not in url_str and "hackerrank.com/dashboard" not in url_str)):
            # Show overlay immediately when navigating to contest pages
            print("🏆 Detected HackerRank contest page, showing overlay...")
            
            # Print the stored user data for debugging
            print(f"👤 Using stored user data: Name='{self.username}', College='{self.college_name}', Roll='{self.roll_number}'")
            
            # Use our stored user data to update the overlay - no need to fetch from localStorage
            self.update_user_overlay_with_stored_data()
            
            # Make sure overlay is raised to be visible
            self.overlay_frame.raise_()
            
            # Schedule another raise after a short delay to ensure visibility
            QTimer.singleShot(100, self.overlay_frame.raise_)
            QTimer.singleShot(500, self.overlay_frame.raise_)  # Additional raise after page load
        else:
            # If we are on a non-HackerRank URL and not redirecting, hide the overlay
            if not self.redirecting_from_hackerrank and self.overlay_frame.isVisible():
                print("📋 Not on HackerRank page and not redirecting, hiding overlay...")
                self.overlay_frame.hide()
        
        # Check if user has been logged out and redirected to login page
        # Match any variation of the login path, case-insensitive
        if not self.initial_load and ("seedit.site/login" in url_str.lower() or "/Login" in url_str):
            print("🚪 Detected navigation to login page (not initial load), cleaning up...")
            
            # Clear HackerRank authentication flags in browser with improved error handling
            self.browser.page().runJavaScript(
                '''
                (function() { // Wrap in IIFE to prevent illegal return statement errors
                    try {
                        // Clear HackerRank auth flags
                        localStorage.removeItem('hackerRankAuth');
                        sessionStorage.removeItem('hackerRankAuthInProgress');
                        sessionStorage.removeItem('currentHackerRankAssessmentUrl');
                        
                        // Clear all storage for a complete reset
                        localStorage.clear();
                        sessionStorage.clear();
                        
                        // Attempt to clear all cookies programmatically
                        const cookies = document.cookie.split(";");
                        for (let i = 0; i < cookies.length; i++) {
                            const cookie = cookies[i];
                            const eqPos = cookie.indexOf("=");
                            const name = eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim();
                            document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
                            document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=.hackerrank.com";
                            document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=seedit.site";
                        }
                        
                        console.log("✅ Completely cleared all storage, auth flags, and cookies on logout");
                        return true; // Now this return is inside a function
                    } catch (e) {
                        console.error("❌ Error clearing auth flags:", e);
                        return false; // Now this return is inside a function
                    }
                })(); // Immediately invoke
                '''
            )
            
            # Reset the internal auth flag
            self.logged_in_to_hackerrank = False
            
            # Clear HTTP cache and cookies through PyQt
            self.browser.page().profile().clearHttpCache()
            self.browser.page().profile().cookieStore().deleteAllCookies()
            
            print("✅ Completed logout cleanup")
            
            # Wait a brief moment for the JavaScript to complete
            time.sleep(0.5)
            
            # Unblock keyboard shortcuts before closing
            try:
                self.unblock_win_shortcuts()
                print("✅ Unblocked keyboard shortcuts")
            except Exception as e:
                print(f"⚠️ Warning: Error unblocking shortcuts: {e}")
            
            # Force close after a short delay to let the user see the login page
            # Use try-except to handle any errors during shutdown
            try:
                QTimer.singleShot(1500, lambda: self.close())
                print("🔄 Scheduled application close")
            except Exception as e:
                print(f"❌ Error scheduling close: {e}")
            
            return  # Exit this method to prevent further processing
        
        # Toggle End Assessment and Questions buttons visibility based on URL
        if "hackerrank.com" in url_str:
            # Only clear history if flag is 0 (first time)
            if not hasattr(self, 'history_cleared_for_hackerrank') or self.history_cleared_for_hackerrank == 0:
                self.browser.page().history().clear()
                print("🧹 Navigation history cleared when displaying End Assessment button")
                self.history_cleared_for_hackerrank = 1
            
            # Show End Assessment button on all HackerRank pages
            self.end_assessment_button.show()
            
            # Show Dark Mode button on all HackerRank pages
            self.dark_mode_button.show()
            
            # Show Questions button only on challenge pages
            if "/challenges" in url_str:
                self.questions_button.show()
                print("📝 Showing Questions button on challenges page")
            else:
                self.questions_button.hide()
                print("📝 Hiding Questions button on non-challenges page")
        else:
            # Hide buttons when not on HackerRank pages
            self.end_assessment_button.hide()
            self.questions_button.hide()
            self.dark_mode_button.hide()
            
            # Reset the flag when leaving HackerRank pages
            self.history_cleared_for_hackerrank = 0
            print("🔄 Reset history clear flag for next HackerRank visit")
        
        # Store the currently selected assessment URL if it's a HackerRank contest URL
        # This will be set by the assessment component when a user selects a module
        if "hackerrank.com/contests/" in url_str and "/challenges" in url_str:
            self.current_assessment_url = url_str
            print(f"🔖 Stored current assessment URL: {self.current_assessment_url}")
        
        # Set PyQt detection flag whenever we navigate to our app
        if self.seed_base_url in url_str:
            self.browser.page().runJavaScript(
                '''
                try {
                    // Call the PyQt ready function if it exists
                    if (typeof window.pyqtAppReady === 'function') {
                        window.pyqtAppReady();
                        console.log("Called pyqtAppReady function");
                        } else {
                        // Fallback: set the flag directly
                        window.pyqtFlag = true;
                        console.log("Set pyqtFlag to true directly");
                    }
                } catch (e) {
                    console.error("Error setting PyQt flag:", e);
                }
                '''
            )
        
        # Check if redirecting from SEED-IT dashboard to HackerRank login
        # This means authentication is starting
        if ("hackerrank.com/auth/login" in url_str and 
            self.browser.page().history().backItem().url().toString().startswith("https://www.seedit.site")):
            print("⚠️ Starting HackerRank authentication process...")
            # Clear any existing auth flags to ensure a clean start
            self.browser.page().runJavaScript(
                '''
                try {
                    // Clear any existing auth flags
                    localStorage.removeItem('hackerRankAuth');
                    sessionStorage.removeItem('hackerRankAuthInProgress');
                    console.log("🧹 Cleared existing auth flags to start fresh authentication");
                } catch (e) {
                    console.error("❌ Error clearing auth flags:", e);
                }
                '''
            )
            # Reset the flag
            self.logged_in_to_hackerrank = False
            print("🔄 Reset HackerRank authentication status")
        
        # Check for HackerRank login or authentication pages
        elif any(hr_pattern in url_str for hr_pattern in [
                "hackerrank.com/auth/login", 
                "hackerrank.com/auth/signup", 
                "hackerrank.com/auth", 
                "hackerrank.com/login",
                "hackerrank.com/auth/password_reset"
            ]):
            # User is on HackerRank login page
            print("⚠️ On HackerRank login/auth page, waiting for user to log in...")
            # No cookie clearing here - we want to maintain the auth cookies
        
        # Check for HackerRank dashboard or authenticated pages
        # THIS IS WHERE WE DETECT SUCCESSFUL LOGIN
        elif "hackerrank.com/dashboard" in url_str:
            # User successfully logged into HackerRank main dashboard
            print("✅ HackerRank main dashboard detected, setting auth flag and redirecting...")
            
            # Set flag indicating successful login
            self.logged_in_to_hackerrank = True
            
            # Set authentication flags in storage
            self.browser.page().runJavaScript(
                '''
                try {
                    // Set the authentication flag in sessionStorage
                    sessionStorage.setItem('hackerRankAuthInProgress', 'true');
                    // Also store in localStorage for persistence across refreshes
                    localStorage.setItem('hackerRankAuth', 'true');
                    console.log("🔑 Set hackerRankAuthInProgress to true in sessionStorage and localStorage");
                    
                    // Call auth completion handler if it exists
                    if (typeof window.onHackerRankAuthComplete === 'function') {
                        window.onHackerRankAuthComplete();
                        console.log("🔐 Called onHackerRankAuthComplete function");
                    } else {
                        console.log("⚠️ onHackerRankAuthComplete function not found");
                    }
                } catch (e) {
                    console.error("❌ Error setting storage:", e);
                }
                '''
            )
            
            # Remove login pages from navigation history
            self.browser.page().history().clear()
            print("🧹 Navigation history cleared")
            
            # Now redirect to the dashboard
            print("🔄 Redirecting to seedit.site dashboard with auth flag...")
            self.browser.setUrl(QUrl(self.seed_base_url + "/student/dashboard"))
            
        # Handle the main HackerRank contests page (without specific contest ID)
        elif url_str == "https://www.hackerrank.com/contests" or url_str.endswith("/contests") or url_str.endswith("/contests/"):
            print("⚠️ On main HackerRank contests page, redirecting to appropriate page")
            
            # User is on the main contests page without a specific contest
            # Need to redirect to either the specific assessment or dashboard
            
            # First check if we already have a stored assessment URL
            if hasattr(self, 'current_assessment_url') and self.current_assessment_url:
                print(f"🔄 Redirecting from main contests page to stored assessment URL: {self.current_assessment_url}")
                self.browser.setUrl(QUrl(self.current_assessment_url))
            else:
                # No stored assessment URL, try to get it from the React component
                print("🔍 No stored assessment URL, checking React component...")
                self.browser.page().runJavaScript(
                    '''
                    try {
                        // Try to get the current assessment URL from the React component
                        let result = null;
                        if (typeof window.getCurrentHackerRankAssessmentUrl === 'function') {
                            result = window.getCurrentHackerRankAssessmentUrl();
                            console.log("🔍 Got assessment URL from React component:", result);
                        } else if (window.currentHackerRankAssessmentUrl) {
                            result = window.currentHackerRankAssessmentUrl;
                            console.log("🔍 Got assessment URL from window object:", result);
                        } else {
                            try {
                                result = sessionStorage.getItem('currentHackerRankAssessmentUrl');
                                console.log("🔍 Got assessment URL from sessionStorage:", result);
                            } catch (e) {
                                console.error("❌ Error accessing sessionStorage:", e);
                            }
                        }
                        return result;
                    } catch (e) {
                        console.error("❌ Error getting assessment URL from React:", e);
                        return null;
                    }
                    ''', 
                    lambda result: self.redirect_from_contests_page(result)
                )
        
        # Handle specific HackerRank contest URLs
        elif "hackerrank.com/contests/" in url_str:
            # Check if we're on a challenges page which we want to keep
            if "/challenges" in url_str:
                # This is a valid assessment page - allow it to display
                print("✅ On HackerRank challenge page, allowing this URL")
                
                # Store this URL for future reference
                self.current_assessment_url = url_str
                print(f"🔖 Updated current assessment URL: {self.current_assessment_url}")
                
                # Still keep the authentication flag updated
                if not self.logged_in_to_hackerrank:
                    self.logged_in_to_hackerrank = True
                    print("🔐 Updated authentication flag to true")
                
                # Update the storage flags to maintain authentication state
                self.browser.page().runJavaScript(
                    '''
                    try {
                        // Ensure authentication flags are set
                        if (localStorage.getItem('hackerRankAuth') !== 'true') {
                            localStorage.setItem('hackerRankAuth', 'true');
                        }
                        if (sessionStorage.getItem('hackerRankAuthInProgress') !== 'true') {
                            sessionStorage.setItem('hackerRankAuthInProgress', 'true');
                        }
                        console.log("🔐 Ensured auth flags are set on challenge page");
                    } catch (e) {
                        console.error("❌ Error setting auth flags on challenge page:", e);
                    }
                    '''
                )
            else:
                # This is a non-challenge contest page (like leaderboard or main contests page)
                print("⚠️ On HackerRank non-challenge page, checking if redirection needed")
                
                # First check if we can get the URL from the React component 
                self.browser.page().runJavaScript(
                    '''
                    try {
                        // Try to get the current assessment URL from the window object
                        let result = null;
                        if (typeof window.getCurrentHackerRankAssessmentUrl === 'function') {
                            result = window.getCurrentHackerRankAssessmentUrl();
                            console.log("🔍 Got assessment URL from component:", result);
                        } else if (window.currentHackerRankAssessmentUrl) {
                            result = window.currentHackerRankAssessmentUrl;
                            console.log("🔍 Got assessment URL from window object:", result);
                        } else {
                            try {
                                result = sessionStorage.getItem('currentHackerRankAssessmentUrl');
                                console.log("🔍 Got assessment URL from sessionStorage:", result);
                            } catch (e) {
                                console.error("❌ Error accessing sessionStorage:", e);
                            }
                        }
                        return result;
                    } catch (e) {
                        console.error("❌ Error getting assessment URL:", e);
                        return null;
                    }
                    ''', 
                    lambda result: self.handle_assessment_url_result(result, url_str)
                )
        
        # Handle other authenticated HackerRank pages
        elif any(hr_pattern in url_str for hr_pattern in [
                "hackerrank.com/profile", 
                "hackerrank.com/challenges",
                "hackerrank.com/domains",
                "hackerrank.com/skills"
            ]):
            # Other HackerRank authenticated pages - redirect back to dashboard
            print("⚠️ On other HackerRank page, redirecting to dashboard")
            
            # Set authentication flag since user is clearly authenticated
            self.logged_in_to_hackerrank = True
            
            # Update auth flags
            self.browser.page().runJavaScript(
                '''
                try {
                    // Update authentication flags
                    localStorage.setItem('hackerRankAuth', 'true');
                    sessionStorage.setItem('hackerRankAuthInProgress', 'true');
                    console.log("🔐 Updated auth flags");
                } catch (e) {
                    console.error("❌ Error updating auth flags:", e);
                }
                '''
            )
            
            # Redirect back to our dashboard
            self.browser.setUrl(QUrl(self.seed_base_url + "/student/dashboard"))
        
        # Handle other URL changes as needed
        if self.seed_base_url + "/student/dashboard" in url_str:
            # Check if we're returning to dashboard after successful login
            if self.logged_in_to_hackerrank:
                # When we land back on the dashboard after login, verify auth flags immediately
                print("📋 On student dashboard after successful login, checking auth flags")
                self.check_auth_status_on_dashboard()
            else:
                # Normal dashboard visit (not after login)
                print("📋 On student dashboard (not after login), waiting to check auth flags")
                # Wait a brief moment to ensure the page is fully loaded
                QTimer.singleShot(1000, self.check_auth_status_on_dashboard)
    
    def redirect_from_contests_page(self, js_result):
        """Handle redirect from the main contests page"""
        # Set redirecting flag before we navigate away
        self.redirecting_from_hackerrank = True
        print("🔄 Starting redirection from HackerRank - keeping overlay visible")
        
        if js_result:
            print(f"🔄 Redirecting from main contests page to URL from React: {js_result}")
            self.current_assessment_url = js_result
            self.browser.setUrl(QUrl(js_result))
        else:
            # If we couldn't get a URL from React, redirect to our dashboard
            print("⚠️ No assessment URL found for redirect, returning to dashboard")
            self.browser.setUrl(QUrl(self.seed_base_url + "/student/dashboard"))

    def check_auth_status_on_dashboard(self):
        # Run JavaScript to ensure auth flags are set and call our check function
        print("🔍 Checking authentication status on dashboard...")
        
        # Only set/update auth flags if we're coming from genuine HackerRank login
        if self.logged_in_to_hackerrank:
            print("✅ Confirming HackerRank authentication (coming from HackerRank dashboard)")
            self.browser.page().runJavaScript(
                '''
                try {
                    console.log("🔄 PyQt calling check_auth_status_on_dashboard (with auth)");
                    
                    // Get current authentication status
                    const currentLocalStorage = localStorage.getItem('hackerRankAuth');
                    const currentSessionStorage = sessionStorage.getItem('hackerRankAuthInProgress');
                    console.log("Current auth status - localStorage:", currentLocalStorage, "sessionStorage:", currentSessionStorage);
                    
                    // Double-check the auth flags are set
                    if (localStorage.getItem('hackerRankAuth') !== 'true') {
                        localStorage.setItem('hackerRankAuth', 'true');
                        console.log("🔑 Updated localStorage hackerRankAuth to true");
                    }
                    if (sessionStorage.getItem('hackerRankAuthInProgress') !== 'true') {
                        sessionStorage.setItem('hackerRankAuthInProgress', 'true');
                        console.log("🔑 Updated sessionStorage hackerRankAuthInProgress to true");
                    }
                    
                    // Call our check functions if they exist
                    if (typeof window.checkAndUpdateHackerRankAuth === 'function') {
                        console.log("🔄 Calling checkAndUpdateHackerRankAuth function");
                        const result = window.checkAndUpdateHackerRankAuth();
                        console.log("checkAndUpdateHackerRankAuth result:", result);
                    } else if (typeof window.setHackerRankAuthStatus === 'function') {
                        console.log("🔄 Calling setHackerRankAuthStatus function");
                        window.setHackerRankAuthStatus(true);
                    } else if (typeof window.onHackerRankAuthComplete === 'function') {
                        console.log("🔄 Calling onHackerRankAuthComplete function");
                        window.onHackerRankAuthComplete();
                    } else {
                        console.warn("⚠️ No auth functions found on window object");
                    }
                    
                    console.log("✅ Auth status verified on dashboard return");
                } catch (e) {
                    console.error("❌ Error verifying auth status:", e);
                }
                '''
            )
        else:
            # Just check if auth functions exist but don't set any flags
            print("🔍 Regular dashboard check (not from HackerRank auth)")
            self.browser.page().runJavaScript(
                '''
                try {
                    console.log("🔍 Normal dashboard check (not from HackerRank)");
                    
                    // Get current authentication status
                    const currentLocalStorage = localStorage.getItem('hackerRankAuth');
                    const currentSessionStorage = sessionStorage.getItem('hackerRankAuthInProgress');
                    console.log("Current auth status - localStorage:", currentLocalStorage, "sessionStorage:", currentSessionStorage);
                    
                    // Only update UI based on EXISTING values, don't set new ones
                    const isAuth = currentLocalStorage === 'true' || currentSessionStorage === 'true';
                    
                    // Call our check functions if they exist and if already authenticated
                    if (isAuth) {
                        if (typeof window.checkAndUpdateHackerRankAuth === 'function') {
                            console.log("🔄 Calling checkAndUpdateHackerRankAuth function");
                            window.checkAndUpdateHackerRankAuth();
                        } else if (typeof window.updateAuthUI === 'function') {
                            console.log("🔄 Calling updateAuthUI function");
                            window.updateAuthUI(isAuth);
                        }
                    }
                    
                    console.log("✅ Regular dashboard check completed");
                } catch (e) {
                    console.error("❌ Error checking dashboard:", e);
                }
                '''
            )
        
        # Schedule another check in 3 seconds just to be sure
        # Sometimes the first check might run before React components are fully mounted
        QTimer.singleShot(3000, self.delayed_auth_check)
        
    def delayed_auth_check(self):
        """Secondary check to make sure auth status is properly recognized"""
        print("🔄 Running delayed auth status check...")
        
        # Only update flags if we came from genuine HackerRank login
        if self.logged_in_to_hackerrank:
            self.browser.page().runJavaScript(
                '''
                try {
                    console.log("🔄 Running delayed authentication check (with auth)");
                    
                    // Force both flags to be true
                    localStorage.setItem('hackerRankAuth', 'true');
                    sessionStorage.setItem('hackerRankAuthInProgress', 'true');
                    
                    // Try to call any available authentication function
                    if (typeof window.checkAndUpdateHackerRankAuth === 'function') {
                        window.checkAndUpdateHackerRankAuth();
                    } else if (typeof window.updateAuthUI === 'function') {
                        window.updateAuthUI(true);
                    }
                    
                    console.log("✅ Delayed auth check completed");
                } catch (e) {
                    console.error("❌ Error in delayed auth check:", e);
                }
                '''
            )
        else:
            # Just check existing values without setting new ones
            self.browser.page().runJavaScript(
                '''
                try {
                    console.log("🔄 Running delayed normal check (without auth)");
                    
                    // Check if already authenticated
                    const currentLocalStorage = localStorage.getItem('hackerRankAuth');
                    const currentSessionStorage = sessionStorage.getItem('hackerRankAuthInProgress');
                    const isAuth = currentLocalStorage === 'true' || currentSessionStorage === 'true';
                    
                    // If already authenticated, make sure UI reflects this
                    if (isAuth && typeof window.updateAuthUI === 'function') {
                        window.updateAuthUI(true);
                    }
                    
                    console.log("✅ Delayed normal check completed");
                } catch (e) {
                    console.error("❌ Error in delayed normal check:", e);
                }
                '''
            )

    def handle_assessment_url_result(self, js_result, current_url):
        """Handle the result of the JavaScript getCurrentHackerRankAssessmentUrl call"""
        # Set redirecting flag before we navigate away
        self.redirecting_from_hackerrank = True
        print("🔄 Starting redirection from HackerRank contest - keeping overlay visible")
        
        if js_result:
            # We got a valid URL from the component
            print(f"🔄 Redirecting to stored assessment challenge URL from component: {js_result}")
            self.current_assessment_url = js_result
            self.browser.setUrl(QUrl(js_result))
        else:
            # We didn't get a URL from the component, use our fallback methods
            # See if we have a specific assessment URL stored to redirect to
            if hasattr(self, 'current_assessment_url') and self.current_assessment_url:
                print(f"🔄 Redirecting to stored assessment challenge URL: {self.current_assessment_url}")
                self.browser.setUrl(QUrl(self.current_assessment_url))
            else:
                # If we don't have a stored URL but can extract the contest ID, go to its challenges page
                try:
                    # Extract contest ID from the URL
                    import re
                    contest_match = re.search(r'contests/([^/]+)', current_url)
                    if contest_match:
                        contest_id = contest_match.group(1)
                        challenge_url = f"https://www.hackerrank.com/contests/{contest_id}/challenges"
                        print(f"🔄 Extracted contest ID: {contest_id}, redirecting to challenges page")
                        self.current_assessment_url = challenge_url
                        self.browser.setUrl(QUrl(challenge_url))
                    else:
                        # If we can't extract it, just go back to our dashboard
                        print("⚠️ Could not extract contest ID, returning to dashboard")
                        self.browser.setUrl(QUrl(self.seed_base_url + "/student/dashboard"))
                except Exception as e:
                    print(f"❌ Error extracting contest ID: {e}")
                    self.browser.setUrl(QUrl(self.seed_base_url + "/student/dashboard"))

    def handle_end_assessment(self):
        """Handle the End Assessment button click - redirect to dashboard from HackerRank"""
        print("End Assessment button clicked, redirecting to dashboard...")
        
        # Set redirecting flag before we navigate away
        self.redirecting_from_hackerrank = True
        print("🔄 Starting redirection from End Assessment - keeping overlay visible")
        
        # Navigate back to dashboard
        self.browser.setUrl(QUrl(self.seed_base_url + "/student/dashboard"))
        
        # Make sure the end assessment button is hidden
        self.end_assessment_button.hide()

    def toggle_fullscreen(self):
        """Toggle fullscreen mode"""
        if self.isFullScreen():
            self.showMaximized()
        else:
            self.showFullScreen()

    def update_overlay_layout_and_geometry(self):
        """Update overlay layout, margins, content and geometry based on the current URL"""
        if not hasattr(self, 'name_label') or not hasattr(self, 'overlay_frame') or not hasattr(self, 'browser'):
            return
            
        try:
            url_str = self.browser.url().toString()
        except Exception:
            url_str = ""
            
        is_contest = "hackerrank.com/contests/" in url_str
        
        # Determine geometry parameters
        if is_contest:
            nav_bar_height = 50
            additional_offset = 0
            overlay_height = 60
            if self.overlay_frame.layout() is not None:
                self.overlay_frame.layout().setContentsMargins(15, 0, 15, 0)
        else:
            nav_bar_height = 50
            additional_offset = 0
            overlay_height = 80
            if self.overlay_frame.layout() is not None:
                self.overlay_frame.layout().setContentsMargins(15, 0, 15, 0)
                
        # Reposition the overlay frame
        content_width = self.width()
        self.overlay_frame.setGeometry(0, nav_bar_height + additional_offset, 
                                     content_width, overlay_height)
                                     
        # Update the HTML content of the label based on whether it is a contest page or general page
        if is_contest:
            # Horizontal layout for contest pages (60px height)
            self.name_label.setText(f"""
    <table width="100%" style="height: 100%; border-collapse: collapse; font-family: 'Segoe UI', Arial, sans-serif; background: transparent; border: none;">
        <tr>
            <td style="font-size: 16px; font-weight: bold; color: #2c3e50; vertical-align: middle; padding: 0;">
                <span style="color: #4CAF50;">Name:</span> {self.username}
            </td>
            <td style="font-size: 16px; font-weight: bold; color: #2c3e50; vertical-align: middle; text-align: center; padding: 0;">
                <span style="color: #4CAF50;">College:</span> {self.college_name}
            </td>
            <td style="font-size: 16px; font-weight: bold; color: #2c3e50; vertical-align: middle; text-align: right; padding: 0;">
                <span style="color: #4CAF50;">Roll No:</span> {self.roll_number}
            </td>
        </tr>
    </table>
    """)
        else:
            # Vertical layout for general HackerRank pages (80px height)
            self.name_label.setText(f"""
    <div style="font-family: 'Segoe UI', Arial, sans-serif; padding: 5px 10px; background-color: #f8f9fa; border-radius: 6px; border: 1px solid #e9ecef; box-shadow: 0 2px 4px rgba(0,0,0,0.05); width: 100%;">
        <div style="font-size: 16px; font-weight: bold; color: #2c3e50; border-bottom: 2px solid #4CAF50; padding-bottom: 2px; margin-bottom: 4px;">
            <span style="color: #4CAF50;">Name:</span> {self.username}
        </div>
        <div style="font-size: 13px; font-weight: 500; color: #34495e; margin-bottom: 2px;">
            <span style="color: #4CAF50; font-weight: bold;">College:</span> {self.college_name}
        </div>
        <div style="font-size: 13px; font-weight: 500; color: #34495e;">
            <span style="color: #4CAF50; font-weight: bold;">Roll No:</span> {self.roll_number}
        </div>
    </div>
    """)

    def resizeEvent(self, event):
        """Handle window resize to reposition overlays"""
        # Handle existing overlay frame layout and geometry
        self.update_overlay_layout_and_geometry()
        
        # Handle loading overlay - make it cover the entire window
        self.loading_overlay.setGeometry(0, 0, self.width(), self.height())
        
        # Allow normal resize processing
        super().resizeEvent(event)

    def store_user_data(self, data):
        """Store user data fetched from localStorage on our domain"""
        print(f"🔍 Received data from JavaScript: {data}")
        if data and isinstance(data, dict):
            # Print each extracted value for debugging
            name = data.get('name', "Unknown User")
            college = data.get('college', "Unknown College")
            roll = data.get('roll', "N/A")
            
            print(f"✅ Extracted user data: Name='{name}', College='{college}', Roll='{roll}'")
            
            # Only update values if they are not empty/default
            if name != "SEED-IT User" and name != "Unknown User":
                self.username = name
            if college != "SEED Institute of Training" and college != "Unknown College":
                self.college_name = college
            if roll != "N/A":
                self.roll_number = roll
                
            print(f"👤 Updated user data in class: Name='{self.username}', College='{self.college_name}', Roll='{self.roll_number}'")
        else:
            print("⚠️ Could not retrieve user data from localStorage")

    def update_user_overlay_with_stored_data(self):
        """Update overlay with user information stored in the class"""
        # Update layout, geometry, and label content based on URL
        self.update_overlay_layout_and_geometry()
        
        # Show and raise the overlay
        print(f"📝 Showing user profile overlay for: {self.username}")
        self.overlay_frame.show()
        self.overlay_frame.raise_()
        
        # Use multiple timers to ensure overlay stays visible during page loading
        QTimer.singleShot(100, self.overlay_frame.raise_)
        QTimer.singleShot(300, self.overlay_frame.raise_)
        QTimer.singleShot(700, self.overlay_frame.raise_)
        QTimer.singleShot(1500, self.ensure_overlay_visible)

    def update_user_overlay(self, user_data):
        """Update the overlay with user information and show it"""
        if user_data and isinstance(user_data, dict):
            # Update stored user information
            self.username = user_data.get('name', self.username)
            self.college_name = user_data.get('college', self.college_name)
            self.roll_number = user_data.get('roll', "Not Available")
            
            # Update layout, geometry, and label content based on URL
            self.update_overlay_layout_and_geometry()
        
        # Show and raise the overlay regardless of user data availability
        print(f"📝 Showing user profile overlay for: {self.username}")
        self.overlay_frame.show()
        self.overlay_frame.raise_()
        
        # Use multiple timers to ensure overlay stays visible during page loading
        QTimer.singleShot(100, self.overlay_frame.raise_)
        QTimer.singleShot(300, self.overlay_frame.raise_)
        QTimer.singleShot(700, self.overlay_frame.raise_)
        QTimer.singleShot(1500, self.ensure_overlay_visible)
        
    def ensure_overlay_visible(self):
        """Additional check to ensure overlay remains visible on contest pages"""
        url_str = self.browser.url().toString()
        if "hackerrank.com/contests/" in url_str and not self.overlay_frame.isVisible():
            print("🔄 Re-raising overlay that may have been hidden during page load")
            self.overlay_frame.show()
            self.overlay_frame.raise_()

    def on_page_load_finished(self, success):
        """Handle page load completion to ensure overlay visibility"""
        if success:
            url_str = self.browser.url().toString()
            
            # Check if we were redirecting from HackerRank
            if self.redirecting_from_hackerrank:
                # Reset the redirecting flag
                self.redirecting_from_hackerrank = False
                
                # Check if we're on a non-HackerRank page now
                if not "hackerrank.com" in url_str:
                    print("📋 Redirection from HackerRank complete, now hiding overlay...")
                    self.overlay_frame.hide()
                else:
                    # Still on HackerRank, keep overlay visible
                    print("📄 Still on HackerRank after redirection, keeping overlay visible")
                    self.overlay_frame.raise_()
                    QTimer.singleShot(300, self.overlay_frame.raise_)
            
            # Always ensure overlay is visible when on HackerRank contests
            elif "hackerrank.com/contests/" in url_str:
                print("📄 Page load finished, re-raising overlay to ensure visibility")
                # Schedule multiple overlay raises after the page finishes loading
                QTimer.singleShot(50, self.overlay_frame.raise_)
                QTimer.singleShot(300, self.overlay_frame.raise_)
                QTimer.singleShot(800, self.ensure_overlay_visible)

    def go_to_challenges_page(self):
        """Handle the Questions button click - redirect to the challenges page of the current assessment"""
        print("Questions button clicked, redirecting to challenges page...")
        
        url_str = self.browser.url().toString()
        
        # Extract contest ID from the current URL if possible
        import re
        contest_match = re.search(r'contests/([^/]+)', url_str)
        if contest_match:
            contest_id = contest_match.group(1)
            # Always construct the main challenges URL for the contest (not specific challenge)
            challenges_url = f"https://www.hackerrank.com/contests/{contest_id}/challenges"
            print(f"📝 Extracted contest ID: {contest_id}, redirecting to main challenges page")
            
            # Store this URL for future reference
            self.current_assessment_url = challenges_url
            
            # Navigate to the challenges page
            self.browser.setUrl(QUrl(challenges_url))
        else:
            print("⚠️ Could not extract contest ID from current URL")
            # If we can't extract from current URL but have a stored URL with '/contests/' in it, try to use that
            if hasattr(self, 'current_assessment_url') and self.current_assessment_url and "/contests/" in self.current_assessment_url:
                # Try to extract from the stored URL
                contest_match = re.search(r'contests/([^/]+)', self.current_assessment_url)
                if contest_match:
                    contest_id = contest_match.group(1)
                    challenges_url = f"https://www.hackerrank.com/contests/{contest_id}/challenges"
                    print(f"📝 Extracted contest ID from stored URL: {contest_id}, redirecting to main challenges page")
                    self.browser.setUrl(QUrl(challenges_url))
                    return
            
            # If we still couldn't get a valid contest ID, inform the user
            print("❌ No valid contest ID found, cannot redirect to challenges page")

    def show_loading_overlay(self):
        """Show the loading overlay when page starts loading"""
        # Only show during initial loading
        if self.initial_loading:
            if not self.loading_overlay.isVisible():
                size = self.size()
                self.loading_overlay.setGeometry(0, 0, size.width(), size.height())
                self.loading_overlay.show()
                self.loading_overlay.raise_()
                
                # Reset the text in case it was changed
                self.loading_label.setText("Loading page...\nPlease wait")
                
                # Start a timer to check loading status
                QTimer.singleShot(15000, self.check_loading_timeout)

    def hide_loading_overlay(self, success=True):
        """Hide the loading overlay when page finishes loading"""
        # Clear any pending timers
        for timer in self.findChildren(QTimer):
            timer.stop()
        
        # Check if we've reached the dashboard
        current_url = self.browser.url().toString()
        if f"{self.seed_base_url}/student/dashboard" in current_url:
            self.initial_loading = False  # Disable loading overlay for future loads
        
        if success:
            # Immediate hide on successful load
            self.loading_overlay.hide()
        else:
            # Fade out if there was an error
            QTimer.singleShot(1000, self.loading_overlay.hide)
        
        # Reset the text
        self.loading_label.setText("Loading page...\nPlease wait")

    def check_loading_timeout(self):
        """Check if loading is taking too long and update the message"""
        if self.loading_overlay.isVisible() and self.initial_loading:
            current_url = self.browser.url().toString()
            
            # Check if page is still loading using page() instead of isLoading
            if not self.browser.page().isLoading():
                self.hide_loading_overlay()
                return
            
            # Update message and give it more time
            self.loading_label.setText("Loading is taking longer than usual...\nPlease be patient")
            
            # Set final timeout
            QTimer.singleShot(7000, lambda: self.hide_loading_overlay(False))

    def update_loading_progress(self, progress):
        """Update loading progress and hide overlay if complete"""
        if not self.initial_loading:
            return
        
        if progress >= 100:
            self.hide_loading_overlay()
        elif self.loading_overlay.isVisible():
            # Update loading message with progress
            if progress > 0:
                self.loading_label.setText(f"Loading page... ({progress}%)\nPlease wait")

    def check_network_status(self):
        """Monitor network connectivity and show warning if disconnected"""
        # Use a simpler JavaScript approach
        self.browser.page().runJavaScript(
            '''
            (function() {
                try {
                    return window.navigator.onLine;
                } catch(e) {
                    return true;  // Default to online if check fails
                }
            })();
            ''',
            self.handle_network_status
        )

    def handle_network_status(self, is_online):
        if not is_online:
            self.loading_label.setText("Network connection lost!\nTrying to reconnect...")
            self.loading_overlay.show()

    def check_session_timeout(self):
        """Check for session timeout and logout if inactive"""
        if time.time() - self.last_activity_time > self.session_timeout:
            print("⚠️ Session timeout - logging out")
            self.browser.setUrl(QUrl(f"{self.seed_base_url}/login"))

    def show_error_message(self, message):
        """Show error message to user"""
        try:
            # Create error label with styling
            error_label = QLabel(f"""
            <div style="background-color: #ffebee; padding: 20px; border-radius: 8px; border: 2px solid #ef5350;">
                <div style="color: #c62828; font-size: 20px; font-weight: bold; margin-bottom: 10px;">
                    ⚠️ Error
                </div>
                <div style="color: #b71c1c; font-size: 16px;">
                    {message}
                </div>
            </div>
            """)
            error_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
            
            # Add error label to main window
            if hasattr(self, 'browser'):
                self.browser.hide()
            
            # Create a new central widget if needed
            if not hasattr(self, 'centralWidget()') or self.centralWidget() is None:
                central_widget = QWidget()
                self.setCentralWidget(central_widget)
                layout = QVBoxLayout(central_widget)
            else:
                layout = self.centralWidget().layout()
                if layout is None:
                    layout = QVBoxLayout(self.centralWidget())
            
            # Add error label to layout
            layout.addWidget(error_label, alignment=Qt.AlignmentFlag.AlignCenter)
            
            # Log the error
            if hasattr(self, 'logger'):
                self.logger.error(f"Application error: {message}")
            else:
                print(f"❌ Error: {message}")
            
        except Exception as e:
            print(f"❌ Failed to show error message: {e}")

def main():
    # Enable high DPI scaling
    if hasattr(Qt, 'AA_EnableHighDpiScaling'):
        QApplication.setAttribute(Qt.AA_EnableHighDpiScaling, True)
    if hasattr(Qt, 'AA_UseHighDpiPixmaps'):
        QApplication.setAttribute(Qt.AA_UseHighDpiPixmaps, True)

    app = QApplication(sys.argv)

    # 🔹 Show pre-launch dialog FIRST
    prelaunch = PreLaunchDialog()
    result = prelaunch.exec()  # modal dialog

    # If user closed dialog or checks failed -> exit
    if result != QDialog.DialogCode.Accepted or not prelaunch.checks_passed:
        sys.exit(0)

    # 🔹 Only now create and show the secure browser
    browser = SecureWebBrowser()
    browser.showFullScreen()

    # Setup process termination with expanded list of applications to terminate
    process_names_to_terminate = [

    # =========================
    # Browsers (Web Access)
    # =========================
    'chrome.exe', 'msedge.exe', 'firefox.exe', 'brave.exe',
    'opera.exe', 'opera_gx.exe', 'vivaldi.exe', 'chromium.exe',
    'iexplore.exe', 'torch.exe', 'maxthon.exe',
    'seamonkey.exe', 'palemoon.exe', 'waterfox.exe',
    'tor.exe', 'tor-browser.exe',

    # =========================
    # Email Clients
    # =========================
    'OUTLOOK.EXE', 'thunderbird.exe', 'emclient.exe',
    'mailbird.exe', 'postbox.exe', 'foxmail.exe',

    # =========================
    # Messaging / Chat Apps
    # =========================
    'WhatsApp.exe', 'Telegram.exe', 'Signal.exe', 'Viber.exe',
    'WeChat.exe', 'Line.exe', 'KakaoTalk.exe',
    'Messenger.exe', 'fbmessenger.exe',
    'Slack.exe', 'Discord.exe',
    'Element.exe', 'Riot.exe', 'Wire.exe',
    'Wickr.exe', 'Threema.exe', 'Session.exe',
    'GroupMe.exe', 'Kik.exe', 'ICQ.exe',

    # =========================
    # Video / Voice / Meetings
    # =========================
    'Teams.exe', 'ms-teams.exe', 'Zoom.exe',
    'Skype.exe', 'Webex.exe', 'BlueJeans.exe',
    'GoToMeeting.exe', 'GoogleMeet.exe',
    'RingCentral.exe',

    # =========================
    # Remote Access / Screen Sharing (CRITICAL)
    # =========================
    'AnyDesk.exe', 'TeamViewer.exe', 'TeamViewer_Service.exe',
    'RustDesk.exe', 'UltraViewer.exe', 'DWAgent.exe',
    'ChromeRemoteDesktop.exe', 'LogMeIn.exe',
    'Splashtop.exe', 'ZohoAssist.exe',
    'RemotePC.exe', 'GoToAssist.exe', 'ISLAlwaysOn.exe',

    # =========================
    # IDEs / Code Editors
    # =========================
    'Code.exe', 'code.exe', 'eclipse.exe',
    'idea64.exe', 'pycharm64.exe',
    'webstorm64.exe', 'androidstudio.exe',
    'netbeans.exe', 'sublime_text.exe',
    'atom.exe', 'notepad++.exe', 'notepad.exe',

    # =========================
    # AI Tools / Assistants
    # =========================
    'ChatGPT.exe', 'chatgpt.exe',
    'Copilot.exe', 'BingChat.exe',
    'Claude.exe', 'Perplexity.exe',
    'YouChat.exe', 'Replit.exe',

    # =========================
    # Screen Recording / Streaming
    # =========================
    'obs64.exe', 'obs32.exe', 'Streamlabs.exe',
    'XSplit.exe', 'Bandicam.exe',
    'Camtasia.exe', 'ShareX.exe',
    'Snagit32.exe', 'Snagit64.exe',
    'Loom.exe', 'FlashBack.exe',

    # =========================
    # Cloud Storage / File Sharing
    # =========================
    'Dropbox.exe', 'GoogleDrive.exe',
    'OneDrive.exe', 'Mega.exe',
    'Box.exe', 'pCloud.exe',
    'ResilioSync.exe', 'Sync.exe',

    # =========================
    # VPN / Proxy (High Risk)
    # =========================
    'NordVPN.exe', 'ExpressVPN.exe',
    'Surfshark.exe', 'CyberGhost.exe',
    'ProtonVPN.exe', 'Windscribe.exe',
    'OpenVPN.exe', 'WireGuard.exe',
    'Tunnelblick.exe', 'HotspotShield.exe',

    # =========================
    # Virtual Machines / Emulators
    # =========================
    'vmware.exe', 'vmplayer.exe',
    'VirtualBox.exe', 'VBoxHeadless.exe',
    'VBoxTray.exe', 'qemu.exe',
    'Bluestacks.exe', 'Nox.exe',
    'LDPlayer.exe', 'Genymotion.exe',

    # =========================
    # Office / Document Viewers (Optional)
    # =========================
    'WINWORD.EXE', 'EXCEL.EXE',
    'POWERPNT.EXE', 'AcroRd32.exe',
    'FoxitReader.exe', 'Calculator.exe'
]

    process_terminator = ProcessTerminationThread(process_names_to_terminate)
    process_terminator.start()

    # Connect cleanup
    app.aboutToQuit.connect(process_terminator.stop)

    sys.exit(app.exec())

if __name__ == '__main__':
    main()
