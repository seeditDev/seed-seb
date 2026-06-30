import os
import sys
import json
import base64
from executor import code_executor
from runtime_manager import runtime_manager

class AssessmentEngine:
    def __init__(self):
        self.app_root = runtime_manager.app_root
        self.questions_dir = os.path.join(self.app_root, "data", "questions")
        self.student_dir = os.path.join(self.app_root, "data", "student")
        
        os.makedirs(self.questions_dir, exist_ok=True)
        os.makedirs(os.path.join(self.questions_dir, "hidden"), exist_ok=True)
        os.makedirs(self.student_dir, exist_ok=True)
        
        self.current_student = None # Holds active student auth_data dict

    def set_student_session(self, auth_data):
        """Sets the active student profile session."""
        if isinstance(auth_data, str):
            try:
                self.current_student = json.loads(auth_data)
            except Exception:
                self.current_student = {"Email": auth_data, "Name": auth_data}
        else:
            self.current_student = auth_data
        print(f"[AssessmentEngine] Active session set for: {self.current_student.get('Email') if self.current_student else 'Guest'}")

    def get_student_id(self):
        """Returns normalized student identifier (email or 'guest')."""
        if self.current_student and "Email" in self.current_student:
            return self.current_student["Email"].replace("@", "_").replace(".", "_")
        return "guest"

    def _obfuscate(self, data_str):
        """Applies basic XOR-based obfuscation to data strings."""
        key = "KITE_SECURE_KEY_2026"
        xored = "".join(chr(ord(c) ^ ord(key[i % len(key)])) for i, c in enumerate(data_str))
        return base64.b64encode(xored.encode('utf-8')).decode('utf-8')

    def _deobfuscate(self, encoded_str):
        """Decrypts the obfuscated string back to its original JSON format."""
        try:
            key = "KITE_SECURE_KEY_2026"
            decoded = base64.b64decode(encoded_str.encode('utf-8')).decode('utf-8')
            xored = "".join(chr(ord(c) ^ ord(key[i % len(key)])) for i, c in enumerate(decoded))
            return xored
        except Exception as e:
            print(f"[AssessmentEngine] Error decrypting hidden tests: {e}")
            return "[]"

    def load_question(self, question_id):
        """Loads and returns public question details (excluding hidden test cases)."""
        file_path = os.path.join(self.questions_dir, f"{question_id}.json")
        if not os.path.exists(file_path):
            # Fallback mock template if file doesn't exist
            return {
                "id": question_id,
                "title": f"Question {question_id}",
                "statement": "Write a program that takes stdin and prints it.",
                "languageTemplates": {},
                "sampleTests": [{"input": "test", "expected": "test\n"}],
                "timeLimit": 2.0,
                "memoryLimit": 256
            }
            
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"[AssessmentEngine] Error loading question {question_id}: {e}")
            return None

    def load_hidden_tests(self, question_id):
        """Loads and decrypts hidden test cases for evaluation."""
        file_path = os.path.join(self.questions_dir, "hidden", f"{question_id}_hidden.json")
        if not os.path.exists(file_path):
            print(f"[AssessmentEngine] Warning: Hidden test cases file not found for {question_id}")
            return []
            
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                content = f.read().strip()
                # Deobfuscate
                decrypted = self._deobfuscate(content)
                return json.loads(decrypted)
        except Exception as e:
            print(f"[AssessmentEngine] Error loading hidden tests for {question_id}: {e}")
            return []

    def save_hidden_tests_raw(self, question_id, test_cases_list):
        """Helper to create and write obfuscated hidden test cases."""
        file_path = os.path.join(self.questions_dir, "hidden", f"{question_id}_hidden.json")
        json_str = json.dumps(test_cases_list)
        obfuscated_str = self._obfuscate(json_str)
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(obfuscated_str)
        print(f"[AssessmentEngine] Wrote obfuscated hidden test cases for: {question_id}")

    def run_code_against_samples(self, language, code, question_id):
        """Runs the student's code against the public sample test cases."""
        question = self.load_question(question_id)
        if not question:
            return {"error": "Question not found"}
            
        sample_tests = question.get("sampleTests", [])
        time_limit = question.get("timeLimit", 2.0)
        
        results = []
        for index, test in enumerate(sample_tests):
            stdin = test.get("input", "")
            expected = test.get("expected", "")
            
            exec_res = code_executor.execute(language, code, stdin=stdin, time_limit=time_limit)
            
            # Standardize expected/actual output comparison (trim whitespace)
            passed = exec_res["stdout"].strip() == expected.strip() and not exec_res["error"]
            
            results.append({
                "caseNumber": index + 1,
                "input": stdin,
                "expected": expected,
                "actual": exec_res["stdout"],
                "stderr": exec_res["stderr"],
                "passed": passed,
                "executionTime": exec_res["execution_time"],
                "error": exec_res["error"]
            })
            
        return results

    def submit_code_assessment(self, language, code, question_id):
        """Runs code against hidden test cases, calculates score, saves progress, and generates payload."""
        question = self.load_question(question_id)
        if not question:
            return {"error": "Question not found"}
            
        hidden_tests = self.load_hidden_tests(question_id)
        time_limit = question.get("timeLimit", 2.0)
        
        if not hidden_tests:
            # Fallback to sample tests if no hidden tests exist
            hidden_tests = question.get("sampleTests", [])
            
        passed_count = 0
        total_time = 0.0
        results = []
        
        for index, test in enumerate(hidden_tests):
            stdin = test.get("input", "")
            expected = test.get("expected", "")
            
            exec_res = code_executor.execute(language, code, stdin=stdin, time_limit=time_limit)
            passed = exec_res["stdout"].strip() == expected.strip() and not exec_res["error"]
            
            if passed:
                passed_count += 1
            total_time += exec_res["execution_time"]
            
            results.append({
                "caseNumber": index + 1,
                "passed": passed,
                "executionTime": exec_res["execution_time"],
                "error": exec_res["error"]
            })
            
        total_tests = len(hidden_tests)
        score = int((passed_count / total_tests) * 100) if total_tests > 0 else 0
        
        student_id = self.get_student_id()
        payload = {
            "studentId": student_id,
            "questionId": question_id,
            "language": language,
            "score": score,
            "passed": passed_count,
            "total": total_tests,
            "executionTime": round(total_time, 3)
        }
        
        # Save results locally
        self.save_submission_record(payload)
        
        # Auto-save student progress state
        self.update_student_progress(question_id, score, status="completed" if score == 100 else "attempted")
        
        return {
            "score": score,
            "passed": passed_count,
            "total": total_tests,
            "executionTime": round(total_time, 3),
            "payload": payload,
            "testCases": results
        }

    def save_answer(self, question_id, answer):
        """Saves current editor code answer for a question to local disk."""
        student_id = self.get_student_id()
        file_path = os.path.join(self.student_dir, f"{student_id}_answers.json")
        
        data = {}
        if os.path.exists(file_path):
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
            except Exception:
                pass
                
        data[question_id] = {
            "answer": answer,
            "timestamp": time.time()
        }
        
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=4)
        print(f"[AssessmentEngine] Saved answer for {question_id}")
        return True

    def load_answer(self, question_id):
        """Loads saved editor code answer for a question."""
        student_id = self.get_student_id()
        file_path = os.path.join(self.student_dir, f"{student_id}_answers.json")
        if not os.path.exists(file_path):
            return ""
            
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data.get(question_id, {}).get("answer", "")
        except Exception:
            return ""

    def save_submission_record(self, payload):
        """Saves a submission payload history record."""
        student_id = self.get_student_id()
        file_path = os.path.join(self.student_dir, f"{student_id}_submissions.json")
        
        records = []
        if os.path.exists(file_path):
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    records = json.load(f)
            except Exception:
                pass
                
        payload["timestamp"] = time.time()
        records.append(payload)
        
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(records, f, indent=4)

    def update_student_progress(self, question_id, score, status):
        """Updates overall student assessment progress state file."""
        student_id = self.get_student_id()
        file_path = os.path.join(self.student_dir, f"{student_id}_progress.json")
        
        progress = {
            "studentId": student_id,
            "completedQuestions": {},
            "totalScore": 0,
            "lastUpdated": time.time()
        }
        
        if os.path.exists(file_path):
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    progress = json.load(f)
            except Exception:
                pass
                
        progress["completedQuestions"][question_id] = {
            "score": max(score, progress["completedQuestions"].get(question_id, {}).get("score", 0)),
            "status": status,
            "timestamp": time.time()
        }
        
        # Calculate total score
        progress["totalScore"] = sum(item["score"] for item in progress["completedQuestions"].values())
        progress["lastUpdated"] = time.time()
        
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(progress, f, indent=4)

    def get_assessment_state(self):
        """Returns the full state of progress for the current logged-in student."""
        student_id = self.get_student_id()
        file_path = os.path.join(self.student_dir, f"{student_id}_progress.json")
        if not os.path.exists(file_path):
            return {
                "studentId": student_id,
                "completedQuestions": {},
                "totalScore": 0,
                "lastUpdated": time.time()
            }
            
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}

# Singleton instance
assessment_engine = AssessmentEngine()
