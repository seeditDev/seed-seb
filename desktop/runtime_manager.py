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
        """Get the base path of the application dynamically based on execution context."""
        exe_name = os.path.basename(sys.executable).lower()
        is_frozen = getattr(sys, 'frozen', False) or exe_name not in ("python.exe", "pythonw.exe", "python3.exe", "python311.exe", "python314.exe")
        
        if is_frozen:
            exec_dir = os.path.dirname(os.path.abspath(sys.executable))
            if os.path.exists(os.path.join(exec_dir, "resources")):
                return exec_dir
            file_dir = os.path.dirname(os.path.abspath(__file__))
            if os.path.exists(os.path.join(file_dir, "resources")):
                return file_dir
            parent_dir = os.path.dirname(exec_dir)
            if os.path.exists(os.path.join(parent_dir, "resources")):
                return parent_dir
            file_parent = os.path.dirname(file_dir)
            if os.path.exists(os.path.join(file_parent, "resources")):
                return file_parent
            return exec_dir

        # Otherwise (during development), return parent of the desktop/app_source directory
        file_dir = os.path.dirname(os.path.abspath(__file__))
        if os.path.basename(file_dir) in ("desktop", "app_source"):
            return os.path.dirname(file_dir)
            
        return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    def resolve_paths(self):
        """Set paths strictly to the portable runtimes inside resources/runtimes.
        No fallbacks to system PATH or host python are allowed, even in development."""
        
        # Strictly lock runtimes to the installed path as requested by the user
        hardcoded_dir = r"C:\Program Files (x86)\SEED-SEB\resources\runtimes"
        if os.path.exists(hardcoded_dir):
            self.runtimes_dir = hardcoded_dir
        else:
            # Sibling / Parent fallback check during local development if not installed
            if not os.path.exists(self.runtimes_dir):
                parent_runtimes = os.path.join(os.path.dirname(self.app_root), "runtimes")
                grandparent_runtimes = os.path.join(os.path.dirname(os.path.dirname(self.app_root)), "runtimes")
                file_dir = os.path.dirname(os.path.abspath(__file__))
                file_parent_runtimes = os.path.join(os.path.dirname(file_dir), "runtimes")
                
                if os.path.exists(parent_runtimes):
                    self.runtimes_dir = parent_runtimes
                elif os.path.exists(grandparent_runtimes):
                    self.runtimes_dir = grandparent_runtimes
                elif os.path.exists(file_parent_runtimes):
                    self.runtimes_dir = file_parent_runtimes

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

    def verify_resources(self):
        """Verifies that all packaged local compilers are present in production/frozen mode."""
        exe_name = os.path.basename(sys.executable).lower()
        is_frozen = getattr(sys, 'frozen', False) or exe_name not in ("python.exe", "pythonw.exe")
        
        if not is_frozen:
            return True
            
        required_binaries = [
            self.binaries.get("gcc"),
            self.binaries.get("javac"),
            self.binaries.get("python")
        ]
        
        missing = []
        for path in required_binaries:
            if not path or not os.path.exists(path):
                missing.append(str(path))
                
        if missing:
            print(f"[RuntimeManager] ERROR: Missing compiled resources: {missing}")
            return False
            
        return True

    def get_binary_path(self, binary_name):
        path = self.binaries.get(binary_name, binary_name)
        if path and os.path.exists(path):
            return path
        if binary_name == "python":
            return sys.executable if sys.executable else "python"
        found = shutil.which(binary_name)
        if found:
            return found
        return path

# Singleton instance
runtime_manager = RuntimeManager()
