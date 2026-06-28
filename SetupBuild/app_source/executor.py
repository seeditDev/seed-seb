import os
import sys
import uuid
import time
import shutil
import subprocess
from runtime_manager import runtime_manager

class CodeExecutor:
    def __init__(self):
        self.app_root = runtime_manager.app_root
        self.workspace_dir = os.path.join(self.app_root, "temp_workspace")
        os.makedirs(self.workspace_dir, exist_ok=True)

    def _create_temp_run_dir(self):
        """Creates a unique directory for the execution run to support concurrency and clean isolation."""
        run_id = str(uuid.uuid4())
        run_dir = os.path.join(self.workspace_dir, f"run_{run_id}")
        os.makedirs(run_dir, exist_ok=True)
        return run_dir

    def _cleanup_dir(self, run_dir):
        """Removes the temporary directory after execution."""
        try:
            shutil.rmtree(run_dir, ignore_errors=True)
        except Exception as e:
            print(f"[CodeExecutor] Error cleaning up run dir {run_dir}: {e}")

    def execute(self, language, code, stdin="", time_limit=2.0):
        """
        Executes code in a secure and isolated local workspace.
        
        Returns:
            dict: {
                "stdout": str,
                "stderr": str,
                "exit_code": int,
                "execution_time": float, # in seconds
                "error": str or None # Timeout, Compilation Error, etc.
            }
        """
        run_dir = self._create_temp_run_dir()
        result = {
            "stdout": "",
            "stderr": "",
            "exit_code": -1,
            "execution_time": 0.0,
            "error": None
        }

        try:
            if language == "python":
                result = self._execute_python(run_dir, code, stdin, time_limit)
            elif language == "c":
                result = self._execute_c(run_dir, code, stdin, time_limit)
            elif language == "cpp":
                result = self._execute_cpp(run_dir, code, stdin, time_limit)
            elif language == "java":
                result = self._execute_java(run_dir, code, stdin, time_limit)
            else:
                result["error"] = f"Unsupported language: {language}"
        except Exception as e:
            result["error"] = f"Execution system failure: {str(e)}"
        finally:
            self._cleanup_dir(run_dir)
            
        return result

    def _get_run_env(self, binary_path):
        """Prepares environment variables by placing the binary directory at the front of the PATH."""
        env = os.environ.copy()
        if binary_path:
            bin_dir = os.path.dirname(os.path.abspath(binary_path))
            env["PATH"] = bin_dir + os.pathsep + env.get("PATH", "")
        # Clean PyInstaller environment variables to avoid runtime conflicts in child subprocesses
        for var in ["PYTHONHOME", "PYTHONPATH", "PYTHONIOENCODING"]:
            if var in env:
                del env[var]
        return env

    def _execute_python(self, run_dir, code, stdin, time_limit):
        file_path = os.path.join(run_dir, "solution.py")
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(code)
            
        python_bin = runtime_manager.get_binary_path("python")
        cmd = [python_bin, "solution.py"]
        env = self._get_run_env(python_bin)
        
        return self._run_process(cmd, run_dir, stdin, time_limit, env=env)

    def _execute_c(self, run_dir, code, stdin, time_limit):
        source_path = os.path.join(run_dir, "solution.c")
        exe_path = os.path.join(run_dir, "solution.exe")
        
        with open(source_path, "w", encoding="utf-8") as f:
            f.write(code)
            
        gcc_bin = runtime_manager.get_binary_path("gcc")
        compile_cmd = [gcc_bin, "-O2", "-o", exe_path, source_path]
        env = self._get_run_env(gcc_bin)
        
        # Hide command windows on Windows
        creationflags = 0x08000000 if sys.platform == "win32" else 0
        
        # Compile
        compile_res = subprocess.run(
            compile_cmd,
            capture_output=True,
            text=True,
            cwd=run_dir,
            timeout=10.0, # Compile timeout
            env=env,
            creationflags=creationflags
        )
        
        if compile_res.returncode != 0:
            return {
                "stdout": "",
                "stderr": compile_res.stderr,
                "exit_code": compile_res.returncode,
                "execution_time": 0.0,
                "error": f"Compilation Error:\n{compile_res.stderr}"
            }
            
        # Run
        return self._run_process([exe_path], run_dir, stdin, time_limit, env=env)

    def _execute_cpp(self, run_dir, code, stdin, time_limit):
        source_path = os.path.join(run_dir, "solution.cpp")
        exe_path = os.path.join(run_dir, "solution.exe")
        
        with open(source_path, "w", encoding="utf-8") as f:
            f.write(code)
            
        gpp_bin = runtime_manager.get_binary_path("g++")
        compile_cmd = [gpp_bin, "-O2", "-std=c++17", "-o", exe_path, source_path]
        env = self._get_run_env(gpp_bin)
        
        # Hide command windows on Windows
        creationflags = 0x08000000 if sys.platform == "win32" else 0
        
        # Compile
        compile_res = subprocess.run(
            compile_cmd,
            capture_output=True,
            text=True,
            cwd=run_dir,
            timeout=10.0,
            env=env,
            creationflags=creationflags
        )
        
        if compile_res.returncode != 0:
            return {
                "stdout": "",
                "stderr": compile_res.stderr,
                "exit_code": compile_res.returncode,
                "execution_time": 0.0,
                "error": f"Compilation Error:\n{compile_res.stderr}"
            }
            
        # Run
        return self._run_process([exe_path], run_dir, stdin, time_limit, env=env)

    def _execute_java(self, run_dir, code, stdin, time_limit):
        # Java class needs to be Main.java
        source_path = os.path.join(run_dir, "Main.java")
        
        with open(source_path, "w", encoding="utf-8") as f:
            f.write(code)
            
        javac_bin = runtime_manager.get_binary_path("javac")
        compile_cmd = [javac_bin, source_path]
        env = self._get_run_env(javac_bin)
        
        # Hide command windows on Windows
        creationflags = 0x08000000 if sys.platform == "win32" else 0
        
        # Compile
        compile_res = subprocess.run(
            compile_cmd,
            capture_output=True,
            text=True,
            cwd=run_dir,
            timeout=15.0,
            env=env,
            creationflags=creationflags
        )
        
        if compile_res.returncode != 0:
            return {
                "stdout": "",
                "stderr": compile_res.stderr,
                "exit_code": compile_res.returncode,
                "execution_time": 0.0,
                "error": f"Compilation Error:\n{compile_res.stderr}"
            }
            
        # Run
        java_bin = runtime_manager.get_binary_path("java")
        run_cmd = [java_bin, "Main"]
        env_run = self._get_run_env(java_bin)
        return self._run_process(run_cmd, run_dir, stdin, time_limit, env=env_run)

    def _run_process(self, cmd, run_dir, stdin, time_limit, env=None):
        """Helper to spawn, feed stdin, enforce time limits, and clean process handles."""
        stdout = ""
        stderr = ""
        exit_code = -1
        error_msg = None
        
        start_time = time.perf_counter()
        
        try:
            # Hide command windows on Windows
            creationflags = 0x08000000 if sys.platform == "win32" else 0
            
            # Create process with redirected streams
            proc = subprocess.Popen(
                cmd,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                cwd=run_dir,
                env=env,
                creationflags=creationflags
            )
            
            try:
                stdout, stderr = proc.communicate(input=stdin, timeout=time_limit)
                exit_code = proc.returncode
            except subprocess.TimeoutExpired:
                # Terminate infinite loops
                proc.kill()
                stdout, stderr = proc.communicate() # Drain pipes after killing
                exit_code = -9
                error_msg = "Time Limit Exceeded (TLE)"
                
        except Exception as e:
            error_msg = f"Runtime execution error: {str(e)}"
            
        end_time = time.perf_counter()
        execution_time = end_time - start_time
        
        return {
            "stdout": stdout,
            "stderr": stderr,
            "exit_code": exit_code,
            "execution_time": round(execution_time, 3),
            "error": error_msg
        }

# Singleton instance
code_executor = CodeExecutor()
if __name__ == "__main__":
    # Small self-test
    exec_engine = CodeExecutor()
    print("Testing python execution...")
    res = exec_engine.execute("python", "print('hello from python')", time_limit=2.0)
    print("Result:", res)
    
    print("\nTesting infinite loop execution safety...")
    res_loop = exec_engine.execute("python", "import time\nwhile True:\n    pass", time_limit=1.5)
    print("Result:", res_loop)
