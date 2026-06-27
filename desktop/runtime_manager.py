import os
import sys
import shutil

class RuntimeManager:
    def __init__(self):
        self.app_root = self.get_app_root()
        self.runtimes_dir = os.path.join(self.app_root, "resources", "runtimes")
        
        # Paths to binaries (defaults to system fallback)
        self.binaries = {
            "gcc": "gcc",
            "g++": "g++",
            "javac": "javac",
            "java": "java",
            "python": sys.executable if sys.executable else "python"
        }
        
        self.resolve_paths()

    def get_app_root(self):
        """Get the base path of the application."""
        if getattr(sys, 'frozen', False):
            # If running as bundle, return the executable directory
            return os.path.dirname(sys.executable)
        # Otherwise, return parent of the desktop directory
        return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    def resolve_paths(self):
        """Set paths strictly to the portable runtimes inside resources/runtimes.
        No fallbacks to system PATH or host python are allowed, even in development."""
        
        # C/C++ (MinGW)
        mingw_bin = os.path.join(self.runtimes_dir, "mingw64", "bin")
        self.binaries["gcc"] = os.path.join(mingw_bin, "gcc.exe")
        self.binaries["g++"] = os.path.join(mingw_bin, "g++.exe")

        # Java (JDK)
        jdk_bin = os.path.join(self.runtimes_dir, "jdk", "bin")
        self.binaries["javac"] = os.path.join(jdk_bin, "javac.exe")
        self.binaries["java"] = os.path.join(jdk_bin, "java.exe")

        # Python (Portable Python)
        self.binaries["python"] = os.path.join(self.runtimes_dir, "python-embed", "python.exe")

        print("[RuntimeManager] Strict Local Configuration (Active for both Dev and Prod):")
        for lang, path in self.binaries.items():
            status = "EXISTS" if os.path.exists(path) else "NOT FOUND (Must pack in resources/runtimes)"
            print(f"  {lang}: {path} ({status})")

    def get_binary_path(self, binary_name):
        return self.binaries.get(binary_name, binary_name)

# Singleton instance
runtime_manager = RuntimeManager()
