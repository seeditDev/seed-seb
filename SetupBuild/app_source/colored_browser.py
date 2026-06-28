import sys
from PyQt6.QtCore import QUrl, Qt, QTimer
from PyQt6.QtWidgets import QApplication, QMainWindow, QVBoxLayout, QWidget
from PyQt6.QtWebEngineWidgets import QWebEngineView
from PyQt6.QtWebEngineCore import QWebEnginePage
from PyQt6.QtGui import QPalette, QColor

class CustomWebEnginePage(QWebEnginePage):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.loadStarted.connect(self.handle_load_started)
        
    def handle_load_started(self):
        # Inject our loading screen CSS and HTML when page starts loading
        self.runJavaScript('''
            // Create and inject our loading screen
            if (!document.getElementById('seed-it-loading-screen')) {
                const style = document.createElement('style');
                style.textContent = `
                    #seed-it-loading-screen {
                        position: fixed;
                        top: 0;
                        left: 0;
                        width: 100vw;
                        height: 100vh;
                        background: linear-gradient(135deg, #4CAF50 0%, #2196F3 100%);
                        display: flex;
                        flex-direction: column;
                        justify-content: center;
                        align-items: center;
                        font-family: 'Segoe UI', Arial, sans-serif;
                        color: white;
                        z-index: 999999;
                    }
                    #seed-it-loading-content {
                        background: rgba(255, 255, 255, 0.95);
                        padding: 2.5rem;
                        border-radius: 15px;
                        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
                        text-align: center;
                        max-width: 600px;
                        margin: 20px;
                    }
                    #seed-it-loading-screen h1 {
                        color: #2c3e50;
                        margin: 0 0 20px 0;
                        font-size: 2.5em;
                        font-weight: bold;
                    }
                    .instructions {
                        color: #34495e;
                        font-size: 1.2em;
                        margin: 15px 0;
                        line-height: 1.6;
                    }
                    .happy-learning {
                        position: fixed;
                        bottom: 30px;
                        font-size: 1.8em;
                        color: white;
                        text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
                        animation: float 3s ease-in-out infinite;
                    }
                    @keyframes float {
                        0% { transform: translateY(0px); }
                        50% { transform: translateY(-10px); }
                        100% { transform: translateY(0px); }
                    }
                    .loading {
                        color: #34495e;
                        font-style: italic;
                        margin-top: 15px;
                    }
                    .progress {
                        width: 80px;
                        height: 80px;
                        margin: 20px auto;
                        border: 5px solid #f3f3f3;
                        border-top: 5px solid #4CAF50;
                        border-radius: 50%;
                        animation: spin 1s linear infinite;
                    }
                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                `;
                document.head.appendChild(style);

                const loadingScreen = document.createElement('div');
                loadingScreen.id = 'seed-it-loading-screen';
                loadingScreen.innerHTML = `
                    <div id="seed-it-loading-content">
                        <h1>Welcome to SEED-IT Learning Platform</h1>
                        <div class="instructions">
                            Please wait while the screen loads...<br>
                            Your learning journey is about to begin!
                        </div>
                        <div class="progress"></div>
                        <div class="loading">
                            Loading your personalized learning experience...
                        </div>
                    </div>
                    <div class="happy-learning">
                        Happy Learning! 🎓
                    </div>
                `;
                document.body.appendChild(loadingScreen);
            }
        ''')

    def javaScriptConsoleMessage(self, level, message, lineNumber, sourceID):
        # Optional: Log JavaScript console messages for debugging
        print(f"JS Console ({level}): {message} at line {lineNumber} from {sourceID}")

class ColoredBrowser(QMainWindow):
    def __init__(self):
        super().__init__()
        self.init_ui()

    def init_ui(self):
        # Set window properties
        self.setWindowTitle('SEED-IT Learning Platform')
        self.setGeometry(100, 100, 800, 600)

        # Set black background for the main window
        self.setStyleSheet("QMainWindow { background-color: black; }")
        
        # Create central widget and layout
        central_widget = QWidget()
        central_widget.setStyleSheet("QWidget { background-color: black; }")
        self.setCentralWidget(central_widget)
        layout = QVBoxLayout(central_widget)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        # Create web view with custom page
        self.browser = QWebEngineView()
        self.page = CustomWebEnginePage(self.browser)
        self.browser.setPage(self.page)
        
        # Set black background for the web view
        palette = self.browser.palette()
        palette.setColor(QPalette.ColorRole.Base, QColor("black"))
        palette.setColor(QPalette.ColorRole.Window, QColor("black"))
        self.browser.setPalette(palette)
        self.browser.setStyleSheet("QWebEngineView { background-color: black; }")
        
        layout.addWidget(self.browser)

        # Show initial loading screen with black background
        initial_html = """
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {
                    margin: 0;
                    padding: 0;
                    width: 100vw;
                    height: 100vh;
                    background: linear-gradient(135deg, #4CAF50 0%, #2196F3 100%);
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    align-items: center;
                    font-family: 'Segoe UI', Arial, sans-serif;
                    color: white;
                }
                .content {
                    background: rgba(255, 255, 255, 0.95);
                    padding: 2.5rem;
                    border-radius: 15px;
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
                    text-align: center;
                    max-width: 600px;
                    margin: 20px;
                }
                h1 {
                    color: #2c3e50;
                    margin: 0 0 20px 0;
                    font-size: 2.5em;
                    font-weight: bold;
                }
                .instructions {
                    color: #34495e;
                    font-size: 1.2em;
                    margin: 15px 0;
                    line-height: 1.6;
                }
                .happy-learning {
                    position: fixed;
                    bottom: 30px;
                    font-size: 1.8em;
                    color: white;
                    text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
                    animation: float 3s ease-in-out infinite;
                }
                @keyframes float {
                    0% { transform: translateY(0px); }
                    50% { transform: translateY(-10px); }
                    100% { transform: translateY(0px); }
                }
                .loading {
                    color: #34495e;
                    font-style: italic;
                    margin-top: 15px;
                }
                .progress {
                    width: 80px;
                    height: 80px;
                    margin: 20px auto;
                    border: 5px solid #f3f3f3;
                    border-top: 5px solid #4CAF50;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                }
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            </style>
        </head>
        <body>
            <div class="content">
                <h1>Welcome to SEED-IT Learning Platform</h1>
                <div class="instructions">
                    Please wait while the screen loads...<br>
                    Your learning journey is about to begin!
                </div>
                <div class="progress"></div>
                <div class="loading">
                    Loading your personalized learning experience...
                </div>
            </div>
            <div class="happy-learning">
                Happy Learning! 🎓
            </div>
        </body>
        </html>
        """
        self.browser.setHtml(initial_html)

        # Connect signals
        self.browser.loadStarted.connect(self.on_load_started)
        self.browser.loadFinished.connect(self.on_load_finished)
        self.browser.loadProgress.connect(self.on_load_progress)

        # Load the URL after a short delay
        QTimer.singleShot(1500, lambda: self.browser.setUrl(QUrl("https://www.seedit.tech/login")))

    def on_load_started(self):
        """Handle load started"""
        print("Loading started...")

    def on_load_progress(self, progress):
        """Handle load progress"""
        print(f"Loading progress: {progress}%")

    def on_load_finished(self, ok):
        """Handle load finished"""
        if ok:
            print("Page loaded successfully!")
        else:
            print("Page failed to load. Showing error message...")
            error_html = """
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body {
                        margin: 0;
                        padding: 0;
                        width: 100vw;
                        height: 100vh;
                        background: linear-gradient(135deg, #4CAF50 0%, #2196F3 100%);
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        font-family: 'Segoe UI', Arial, sans-serif;
                    }
                    .error-content {
                        background: rgba(255, 255, 255, 0.95);
                        padding: 2rem;
                        border-radius: 10px;
                        text-align: center;
                        max-width: 500px;
                    }
                    h1 { color: #e74c3c; }
                    p { color: #34495e; }
                    button {
                        background: #4CAF50;
                        color: white;
                        border: none;
                        padding: 10px 20px;
                        border-radius: 5px;
                        cursor: pointer;
                        margin-top: 15px;
                    }
                    button:hover { background: #45a049; }
                </style>
            </head>
            <body>
                <div class="error-content">
                    <h1>Connection Error</h1>
                    <p>Unable to connect to SEED-IT Learning Platform. Please check your internet connection and try again.</p>
                    <button onclick="window.location.reload()">Retry</button>
                </div>
            </body>
            </html>
            """
            self.browser.setHtml(error_html)

def main():
    app = QApplication(sys.argv)
    
    # Set application-wide black background
    app.setStyle("Fusion")
    palette = QPalette()
    palette.setColor(QPalette.ColorRole.Window, QColor("black"))
    palette.setColor(QPalette.ColorRole.WindowText, QColor("white"))
    palette.setColor(QPalette.ColorRole.Base, QColor("black"))
    palette.setColor(QPalette.ColorRole.AlternateBase, QColor("black"))
    palette.setColor(QPalette.ColorRole.ToolTipBase, QColor("white"))
    palette.setColor(QPalette.ColorRole.ToolTipText, QColor("white"))
    palette.setColor(QPalette.ColorRole.Text, QColor("white"))
    palette.setColor(QPalette.ColorRole.Button, QColor("black"))
    palette.setColor(QPalette.ColorRole.ButtonText, QColor("white"))
    palette.setColor(QPalette.ColorRole.BrightText, QColor("red"))
    palette.setColor(QPalette.ColorRole.Link, QColor(42, 130, 218))
    palette.setColor(QPalette.ColorRole.Highlight, QColor(42, 130, 218))
    palette.setColor(QPalette.ColorRole.HighlightedText, QColor("black"))
    app.setPalette(palette)
    
    browser = ColoredBrowser()
    browser.show()
    sys.exit(app.exec())

if __name__ == '__main__':
    main() 