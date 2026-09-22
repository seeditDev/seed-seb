import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FRONTEND_ROOT = path.resolve(__dirname, '..');
const REAL_COURSES_DIR = path.join(FRONTEND_ROOT, 'src', 'courses', 'data', 'realCourses');
const CATALOG_DIR = path.join(FRONTEND_ROOT, 'src', 'courses', 'data', 'catalog');

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function loadJson(filepath) {
  if (!fs.existsSync(filepath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filepath, 'utf8'));
  } catch (err) {
    console.error(`Error loading JSON from ${filepath}:`, err.message);
    return null;
  }
}

// 1. Build Global Topic Index from all 76 Real Course Files
console.log('📦 Indexing all authentic topics from realCourses/ directory...');
const realFiles = fs.readdirSync(REAL_COURSES_DIR).filter(f => f.endsWith('.json')).sort();
const realCourseDataMap = new Map();
const globalTopicIndex = new Map();

for (const f of realFiles) {
  const data = loadJson(path.join(REAL_COURSES_DIR, f));
  if (!data) continue;
  realCourseDataMap.set(f, data);

  const mods = data.modules || (data.curriculum ? data.curriculum.modules : []) || [];
  for (const m of mods) {
    const ts = m.topics || m.lessons || [];
    for (const t of ts) {
      const tid = t.topicId || t.id;
      const title = (t.title || '').trim().toLowerCase();
      const pCount = (t.pages || []).length;
      const exCount = (t.codeExamples || []).length;

      if (tid) {
        const existing = globalTopicIndex.get(tid);
        if (!existing || pCount > (existing.pages?.length || 0) || exCount > (existing.codeExamples?.length || 0)) {
          globalTopicIndex.set(tid, { ...t, _sourceFile: f, _moduleTitle: m.title });
        }
      }

      if (title) {
        const titleKey = `title:${title}`;
        const existing = globalTopicIndex.get(titleKey);
        if (!existing || pCount > (existing.pages?.length || 0) || exCount > (existing.codeExamples?.length || 0)) {
          globalTopicIndex.set(titleKey, { ...t, _sourceFile: f, _moduleTitle: m.title });
        }
      }
    }
  }
}
console.log(`✅ Global index ready with ${globalTopicIndex.size} indexed topic signatures.`);

// Helper to normalize topic titles for clean deduplication
function normalizeTitle(rawTitle) {
  return String(rawTitle || '')
    .trim()
    .replace(/^(cpp|c\+\+|c|java|python|javascript|js|c#|csharp|sql):\s*/i, '')
    .replace(/^(practice|problem solving|learn|master|solve|intro to|introduction to)\s*[:-]?\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Canonical Module Schemas for Flagship Multi-Source Courses
const CANONICAL_SCHEMAS = {
  // C++ Programming
  cpp: [
    {
      moduleId: 'm01-getting-started-and-environment',
      title: 'Getting Started & C++ Environment',
      description: 'C++ history, compiler toolchains (GCC/Clang/MSVC), compilation process, basic syntax, structure of a C++ program, and standard I/O.',
      estimatedHours: 3.0,
      keywords: ['getting started', 'environment', 'compiler', 'compilation', 'hello world', 'first program', 'structure', 'syntax', 'comments', 'namespaces', 'std::cout']
    },
    {
      moduleId: 'm02-variables-constants-data-types',
      title: 'Variables, Constants & Fundamental Data Types',
      description: 'Primitive types (int, float, double, char, bool), type modifiers (signed, unsigned, short, long), sizeof operator, type casting, and constant qualifiers.',
      estimatedHours: 3.5,
      keywords: ['variable', 'datatype', 'data type', 'constant', 'const', 'type casting', 'type conversion', 'sizeof', 'primitive', 'integer', 'float', 'double', 'char', 'boolean']
    },
    {
      moduleId: 'm03-operators-and-expressions',
      title: 'Operators & Mathematical Expressions',
      description: 'Arithmetic, relational, logical, bitwise, assignment, increment/decrement operators, operator precedence, and associativity.',
      estimatedHours: 4.0,
      keywords: ['operator', 'arithmetic', 'relational', 'logical', 'bitwise', 'assignment', 'increment', 'decrement', 'ternary', 'precedence', 'math operator']
    },
    {
      moduleId: 'm04-input-output-formatting',
      title: 'Input/Output Operations & Math Library',
      description: 'Interactive input with std::cin, buffer management, escape sequences, formatting with <iomanip>, and math functions in <cmath>.',
      estimatedHours: 3.0,
      keywords: ['cin', 'cout', 'user input', 'inputs', 'outputting', 'iomanip', 'cmath', 'math functions', 'formatting', 'basic math']
    },
    {
      moduleId: 'm05-conditional-statements',
      title: 'Conditional Statements & Decision Making',
      description: 'if, if-else, nested if-else, else-if ladder, conditional operator, switch-case statements, and decision flow control.',
      estimatedHours: 4.0,
      keywords: ['condition', 'conditional', 'if', 'else', 'switch', 'decision', 'branching', 'nested if']
    },
    {
      moduleId: 'm06-loops-and-iterations',
      title: 'Loops & Iterative Control',
      description: 'while loops, do-while loops, for loops, nested loops, break, continue, loop optimization, and infinite loop prevention.',
      estimatedHours: 4.5,
      keywords: ['loop', 'while', 'for loop', 'do-while', 'iteration', 'break', 'continue', 'nested loop']
    },
    {
      moduleId: 'm07-functions-and-recursion',
      title: 'Functions & Recursion',
      description: 'Function declarations, definitions, return types, parameter passing (pass by value vs reference), default arguments, function overloading, and recursion.',
      estimatedHours: 4.5,
      keywords: ['function', 'recursion', 'recursive', 'pass by value', 'call by value', 'pass by reference', 'call by reference', 'overloading', 'parameters', 'arguments', 'return']
    },
    {
      moduleId: 'm08-arrays-and-vectors',
      title: 'Arrays & Dynamic Vectors',
      description: '1D arrays, multi-dimensional/2D arrays, array traversal, memory layout, bounds checking, and std::vector basics.',
      estimatedHours: 4.5,
      keywords: ['array', 'arrays', 'vector', '2d array', 'matrix', 'multidimensional', 'traversal', 'dynamic array']
    },
    {
      moduleId: 'm09-strings-and-text-processing',
      title: 'Strings & Text Processing',
      description: 'C-style character arrays vs std::string, string member functions, traversal, manipulation, substrings, concatenation, and search operations.',
      estimatedHours: 4.0,
      keywords: ['string', 'strings', 'cstring', 'character array', 'text processing', 'substring', 'concatenation']
    },
    {
      moduleId: 'm10-pointers-and-memory-management',
      title: 'Pointers, References & Memory Management',
      description: 'Pointer syntax, address-of (&) and dereference (*) operators, pointer arithmetic, pointers with arrays, references, dynamic memory allocation with new/delete, and memory leaks.',
      estimatedHours: 5.0,
      keywords: ['pointer', 'pointers', 'reference', 'address', 'dereference', 'dynamic memory', 'new', 'delete', 'heap', 'stack memory', 'memory leak']
    },
    {
      moduleId: 'm11-structures-unions-enums',
      title: 'Structures, Unions & Enumerations',
      description: 'Custom composite data types, struct declaration and initialization, nested structures, unions, enum, and modern enum classes.',
      estimatedHours: 3.5,
      keywords: ['struct', 'structure', 'structures', 'union', 'unions', 'enum', 'enumeration', 'typedef']
    },
    {
      moduleId: 'm12-oop-classes-and-objects',
      title: 'Object-Oriented Programming: Classes & Objects',
      description: 'OOP paradigm, classes, objects, data encapsulation, access specifiers (public, private, protected), constructors, destructors, and this pointer.',
      estimatedHours: 5.0,
      keywords: ['class', 'classes', 'object', 'objects', 'oop', 'constructor', 'destructor', 'encapsulation', 'access specifier', 'this pointer', 'member function']
    },
    {
      moduleId: 'm13-oop-inheritance-and-polymorphism',
      title: 'Advanced OOP: Inheritance & Polymorphism',
      description: 'Inheritance modes (single, multiple, multilevel, hierarchical), function overriding, virtual functions, abstract classes, pure virtual functions, and operator overloading.',
      estimatedHours: 5.5,
      keywords: ['inheritance', 'polymorphism', 'virtual function', 'abstract class', 'pure virtual', 'override', 'operator overloading', 'base class', 'derived class']
    },
    {
      moduleId: 'm14-exception-handling-and-file-io',
      title: 'Exception Handling & File Streams',
      description: 'try, catch, throw blocks, standard exception hierarchy, custom exceptions, file streams (<fstream>), ifstream, ofstream, reading and writing files.',
      estimatedHours: 4.0,
      keywords: ['exception', 'try', 'catch', 'throw', 'file handling', 'file i/o', 'fstream', 'ifstream', 'ofstream', 'streams', 'file']
    },
    {
      moduleId: 'm15-standard-template-library-stl',
      title: 'Standard Template Library (STL)',
      description: 'STL containers (vector, list, deque, stack, queue, priority_queue, set, map, unordered_map), iterators, and core STL algorithms (sort, find, binary_search, reverse).',
      estimatedHours: 6.0,
      keywords: ['stl', 'standard template library', 'vector', 'stack', 'queue', 'deque', 'set', 'map', 'unordered_map', 'iterator', 'algorithm', 'sort', 'find', 'pair']
    },
    {
      moduleId: 'm16-debugging-and-error-resolution',
      title: 'Code Debugging & Common Pitfalls',
      description: 'Diagnosing syntax errors, linker errors, runtime segmentation faults, memory leaks with valgrind, and test case analysis.',
      estimatedHours: 3.5,
      keywords: ['debug', 'debugging', 'error', 'segmentation fault', 'common error', 'test cases', 'pitfall', 'troubleshoot']
    },
    {
      moduleId: 'm17-logic-building-and-problem-solving',
      title: 'Logic Building & Algorithmic Practice',
      description: 'Mathematical algorithms, number theory drills, pattern printing, matrix transformations, and competitive programming challenges.',
      estimatedHours: 6.0,
      keywords: ['problem solving', 'logic building', 'algorithmic', 'basic math', 'difficulty', 'logical problem', 'challenge', 'practice']
    },
    {
      moduleId: 'm18-real-world-projects',
      title: 'Real-World C++ Capstone Projects',
      description: 'End-to-end software applications including Student Record Management, Banking System, Console Arcade Games, and File Encryption utilities.',
      estimatedHours: 6.0,
      keywords: ['project', 'projects', 'capstone', 'banking system', 'student record', 'console game', 'application']
    }
  ],

  // C Programming
  c: [
    {
      moduleId: 'm01-c-introduction-and-environment',
      title: 'Introduction to C & Environment Setup',
      description: 'History of C, compilation pipeline (preprocessing, compiling, assembling, linking), GCC setup, Hello World, structure of C programs, and comments.',
      estimatedHours: 3.0,
      keywords: ['introduction', 'getting started', 'hello world', 'compilation', 'gcc', 'structure', 'syntax', 'comments']
    },
    {
      moduleId: 'm02-c-variables-constants-data-types',
      title: 'Variables, Constants & Data Types',
      description: 'Basic data types (int, float, double, char), type qualifiers, variables, constants, type conversion, and sizeof.',
      estimatedHours: 3.5,
      keywords: ['variable', 'datatype', 'data type', 'constant', 'sizeof', 'type conversion', 'primitive']
    },
    {
      moduleId: 'm03-c-operators-and-expressions',
      title: 'Operators & Expressions',
      description: 'Arithmetic, relational, logical, bitwise, assignment, and conditional operators with precedence rules.',
      estimatedHours: 4.0,
      keywords: ['operator', 'arithmetic', 'relational', 'logical', 'bitwise', 'assignment', 'precedence']
    },
    {
      moduleId: 'm04-c-input-output-operations',
      title: 'Formatted Input and Output (printf & scanf)',
      description: 'Standard I/O functions, format specifiers (%d, %f, %c, %s, %p), getchar, putchar, and buffer handling.',
      estimatedHours: 3.0,
      keywords: ['printf', 'scanf', 'input', 'output', 'format specifier', 'getchar', 'putchar', 'user input']
    },
    {
      moduleId: 'm05-c-control-flow-conditionals',
      title: 'Control Flow: Conditional Statements',
      description: 'if, if-else, nested if, else-if ladder, and switch-case selection statements.',
      estimatedHours: 3.5,
      keywords: ['condition', 'conditional', 'if', 'else', 'switch', 'branching']
    },
    {
      moduleId: 'm06-c-control-flow-loops',
      title: 'Control Flow: Loops & Iteration',
      description: 'while, do-while, for loops, nested loops, break, continue, and loop optimization.',
      estimatedHours: 4.0,
      keywords: ['loop', 'while', 'for', 'do-while', 'iteration', 'break', 'continue']
    },
    {
      moduleId: 'm07-c-functions-and-recursion',
      title: 'Functions, Variable Scope & Recursion',
      description: 'Function prototypes, definitions, parameters, return types, call by value vs call by reference, variable scope, storage classes, and recursion.',
      estimatedHours: 4.5,
      keywords: ['function', 'recursion', 'call by value', 'call by reference', 'scope', 'storage class', 'prototype']
    },
    {
      moduleId: 'm08-c-arrays-and-matrices',
      title: 'Arrays & Multi-Dimensional Matrices',
      description: '1D arrays, initialization, 2D arrays, matrix multiplication, array passing to functions, and linear search.',
      estimatedHours: 4.5,
      keywords: ['array', 'arrays', 'matrix', '2d array', 'multidimensional']
    },
    {
      moduleId: 'm09-c-strings-and-character-arrays',
      title: 'Strings & Character Manipulation',
      description: 'Null-terminated strings, string I/O (gets/fgets, puts), string library functions (strlen, strcpy, strcmp, strcat), and string processing algorithms.',
      estimatedHours: 4.0,
      keywords: ['string', 'strings', 'character array', 'string manipulation', 'string.h', 'strlen', 'strcpy', 'strcmp']
    },
    {
      moduleId: 'm10-c-pointers-fundamentals',
      title: 'Pointers & Pointer Mechanics',
      description: 'Pointer concepts, address operator, dereferencing, pointer arithmetic, pointers and arrays, pointers to pointers, and function pointers.',
      estimatedHours: 5.0,
      keywords: ['pointer', 'pointers', 'address', 'dereferencing', 'pointer arithmetic', 'double pointer', 'function pointer']
    },
    {
      moduleId: 'm11-c-dynamic-memory-allocation',
      title: 'Dynamic Memory Allocation (malloc, calloc, realloc, free)',
      description: 'Heap vs stack memory, malloc, calloc, realloc, free, memory leaks, dangling pointers, and dynamic arrays.',
      estimatedHours: 4.5,
      keywords: ['dynamic memory', 'malloc', 'calloc', 'realloc', 'free', 'heap', 'memory leak', 'dangling pointer']
    },
    {
      moduleId: 'm12-c-structures-unions-enums',
      title: 'Structures, Unions & Typedef',
      description: 'User-defined types, struct declaration, struct pointers (arrow operator ->), nested structures, unions, enum, and typedef.',
      estimatedHours: 4.0,
      keywords: ['struct', 'structure', 'union', 'enum', 'typedef', 'arrow operator']
    },
    {
      moduleId: 'm13-c-file-handling-and-io',
      title: 'File Handling & Low-Level I/O',
      description: 'File pointers (FILE *), fopen, fclose, fgetc, fputc, fgets, fputs, fprintf, fscanf, fread, fwrite, and binary file handling.',
      estimatedHours: 4.0,
      keywords: ['file', 'file handling', 'fopen', 'fclose', 'fread', 'fwrite', 'fprintf', 'fscanf']
    },
    {
      moduleId: 'm14-c-preprocessor-and-macros',
      title: 'Preprocessor Directives & Modular C',
      description: '#include, #define macros, conditional compilation (#ifdef, #ifndef), header files, and multi-file project architecture.',
      estimatedHours: 3.5,
      keywords: ['preprocessor', 'macro', 'define', 'include', 'header', 'conditional compilation']
    },
    {
      moduleId: 'm15-c-problem-solving-and-projects',
      title: 'Algorithmic Problem Solving & C Projects',
      description: 'Data structure implementations in C, search/sort algorithms, debugging with GDB, and real-world C projects.',
      estimatedHours: 5.0,
      keywords: ['problem solving', 'project', 'projects', 'practice', 'algorithm', 'debugging', 'gdb', 'capstone']
    }
  ],

  // Java Programming
  java: [
    {
      moduleId: 'm01-java-foundations-and-jvm',
      title: 'Java Foundations & JVM Architecture',
      description: 'Java history, JDK vs JRE vs JVM, bytecode, class loaders, first Java application, and syntax rules.',
      estimatedHours: 3.5,
      keywords: ['foundations', 'jvm', 'jdk', 'jre', 'bytecode', 'hello world', 'first program', 'introduction', 'syntax']
    },
    {
      moduleId: 'm02-java-variables-data-types',
      title: 'Variables, Primitive Types & Type Casting',
      description: 'Primitive data types, wrapper classes, variables, constants, type casting (widening & narrowing), and memory allocation.',
      estimatedHours: 3.5,
      keywords: ['variable', 'datatype', 'data type', 'primitive', 'type casting', 'wrapper', 'constants']
    },
    {
      moduleId: 'm03-java-operators-and-math',
      title: 'Operators & Mathematical Operations',
      description: 'Arithmetic, logical, relational, bitwise, assignment, ternary operators, and java.lang.Math.',
      estimatedHours: 3.5,
      keywords: ['operator', 'arithmetic', 'logical', 'relational', 'bitwise', 'math']
    },
    {
      moduleId: 'm04-java-input-output-system',
      title: 'Input/Output & Scanner Class',
      description: 'Scanner class, BufferedReader, System.out.println, formatted printing (printf), and command-line arguments.',
      estimatedHours: 3.0,
      keywords: ['scanner', 'input', 'output', 'bufferedreader', 'system.out', 'user input']
    },
    {
      moduleId: 'm05-java-control-flow-conditionals',
      title: 'Control Flow: Conditionals & Switches',
      description: 'if, if-else, nested if, switch statement, and enhanced switch expressions.',
      estimatedHours: 3.5,
      keywords: ['condition', 'conditional', 'if', 'else', 'switch', 'decision']
    },
    {
      moduleId: 'm06-java-control-flow-loops',
      title: 'Control Flow: Loops & Iterations',
      description: 'while, do-while, for loops, for-each (enhanced for), break, continue, and nested loops.',
      estimatedHours: 4.0,
      keywords: ['loop', 'while', 'for', 'for-each', 'do-while', 'iteration', 'break', 'continue']
    },
    {
      moduleId: 'm07-java-methods-and-recursion',
      title: 'Methods, Scope & Recursion',
      description: 'Method declaration, parameters, return types, method overloading, static vs instance methods, pass-by-value, and recursion.',
      estimatedHours: 4.5,
      keywords: ['method', 'methods', 'recursion', 'function', 'overloading', 'parameters', 'static']
    },
    {
      moduleId: 'm08-java-arrays-and-matrices',
      title: 'Arrays & Multi-Dimensional Matrices',
      description: '1D arrays, 2D arrays, jagged arrays, array manipulation, Arrays utility class, and matrix operations.',
      estimatedHours: 4.0,
      keywords: ['array', 'arrays', 'matrix', '2d array', 'jagged array']
    },
    {
      moduleId: 'm09-java-strings-and-text-handling',
      title: 'Strings, StringBuilder & StringBuffer',
      description: 'String immutability, String pool, String methods, StringBuilder vs StringBuffer, and regex operations.',
      estimatedHours: 4.5,
      keywords: ['string', 'strings', 'stringbuilder', 'stringbuffer', 'string pool', 'text']
    },
    {
      moduleId: 'm10-java-oop-classes-and-objects',
      title: 'Object-Oriented Programming: Classes & Objects',
      description: 'Classes, objects, constructors (default, parameterized, copy), this keyword, encapsulation, and garbage collection.',
      estimatedHours: 5.0,
      keywords: ['class', 'classes', 'object', 'objects', 'constructor', 'encapsulation', 'this keyword', 'oop']
    },
    {
      moduleId: 'm11-java-oop-inheritance-and-interfaces',
      title: 'OOP: Inheritance, Polymorphism & Interfaces',
      description: 'Inheritance types, super keyword, method overriding, dynamic method dispatch, abstract classes, and interfaces.',
      estimatedHours: 5.5,
      keywords: ['inheritance', 'polymorphism', 'interface', 'interfaces', 'abstract class', 'super', 'overriding']
    },
    {
      moduleId: 'm12-java-packages-and-access-modifiers',
      title: 'Packages, Encapsulation & Access Modifiers',
      description: 'public, private, protected, default package-private, custom packages, JARs, and module system.',
      estimatedHours: 3.5,
      keywords: ['package', 'packages', 'access modifier', 'public', 'private', 'protected']
    },
    {
      moduleId: 'm13-java-exception-handling',
      title: 'Exception Handling & Robust Code',
      description: 'try, catch, finally, throw, throws, checked vs unchecked exceptions, custom exception classes, and try-with-resources.',
      estimatedHours: 4.5,
      keywords: ['exception', 'try', 'catch', 'finally', 'throw', 'throws', 'checked exception']
    },
    {
      moduleId: 'm14-java-collections-framework',
      title: 'Java Collections Framework',
      description: 'List (ArrayList, LinkedList), Set (HashSet, TreeSet), Queue, Map (HashMap, TreeMap), iterators, and Collections algorithms.',
      estimatedHours: 6.0,
      keywords: ['collection', 'collections', 'arraylist', 'linkedlist', 'hashset', 'hashmap', 'treeset', 'treemap', 'queue', 'stack', 'map', 'set']
    },
    {
      moduleId: 'm15-java-generics-streams-lambdas',
      title: 'Generics, Lambdas & Java Streams',
      description: 'Generic classes and methods, wildcards, functional interfaces, lambda expressions, Stream API (map, filter, reduce), and Optionals.',
      estimatedHours: 5.5,
      keywords: ['generics', 'lambda', 'stream', 'streams', 'functional interface', 'filter', 'map', 'optional']
    },
    {
      moduleId: 'm16-java-file-io-and-serialization',
      title: 'File I/O, NIO & Serialization',
      description: 'File class, FileReader/FileWriter, FileInputStream/FileOutputStream, Serializable interface, and java.nio.file.',
      estimatedHours: 4.0,
      keywords: ['file', 'file i/o', 'io', 'nio', 'serialization', 'stream', 'reader', 'writer']
    },
    {
      moduleId: 'm17-java-multithreading-concurrency',
      title: 'Multithreading & Concurrency Basics',
      description: 'Thread class, Runnable interface, thread lifecycle, synchronization, deadlock, and ExecutorService.',
      estimatedHours: 4.5,
      keywords: ['thread', 'threads', 'multithreading', 'concurrency', 'runnable', 'synchronization', 'deadlock']
    },
    {
      moduleId: 'm18-java-problem-solving-and-projects',
      title: 'Problem Solving & Enterprise Java Projects',
      description: 'Algorithmic drills, coding challenges, Student Information System, ATM Simulation, and full-stack capstones.',
      estimatedHours: 6.0,
      keywords: ['problem solving', 'project', 'projects', 'practice', 'capstone', 'challenge', 'drills']
    }
  ],

  // Python Programming
  python: [
    {
      moduleId: 'm01-python-foundations-and-syntax',
      title: 'Python Foundations & Execution Model',
      description: 'CPython interpreter, interactive shell, variables, dynamic typing, PEP 8 style guide, and basic syntax.',
      estimatedHours: 3.0,
      keywords: ['foundations', 'introduction', 'syntax', 'hello world', 'interpreter', 'variables', 'dynamic typing']
    },
    {
      moduleId: 'm02-python-data-types-and-operators',
      title: 'Data Types, Numbers & Operators',
      description: 'int, float, complex, bool, arithmetic, comparison, logical, bitwise, identity (is), and membership (in) operators.',
      estimatedHours: 3.5,
      keywords: ['data type', 'numbers', 'operator', 'arithmetic', 'logical', 'bitwise', 'membership', 'identity']
    },
    {
      moduleId: 'm03-python-input-output-formatting',
      title: 'Input, Output & String Formatting',
      description: 'print(), input(), format specifiers, str.format(), and modern f-strings.',
      estimatedHours: 3.0,
      keywords: ['input', 'output', 'print', 'f-string', 'formatting', 'string formatting']
    },
    {
      moduleId: 'm04-python-control-flow-conditionals',
      title: 'Control Flow: Conditionals',
      description: 'if, elif, else statements, nested conditionals, ternary expressions, and truthiness.',
      estimatedHours: 3.5,
      keywords: ['conditional', 'if', 'elif', 'else', 'condition', 'decision']
    },
    {
      moduleId: 'm05-python-control-flow-loops',
      title: 'Control Flow: Loops & Iterations',
      description: 'while loops, for loops, range(), enumerate(), zip(), break, continue, and loop else clauses.',
      estimatedHours: 4.0,
      keywords: ['loop', 'for', 'while', 'range', 'enumerate', 'zip', 'break', 'continue']
    },
    {
      moduleId: 'm06-python-functions-and-lambdas',
      title: 'Functions, Scopes & Lambda Expressions',
      description: 'Function definitions, *args, **kwargs, default parameters, variable scope (LEGB rule), closures, and anonymous lambda functions.',
      estimatedHours: 4.5,
      keywords: ['function', 'functions', 'lambda', 'args', 'kwargs', 'scope', 'closure', 'def']
    },
    {
      moduleId: 'm07-python-strings-and-text',
      title: 'Strings & Regular Expressions',
      description: 'String slicing, indexing, string methods (split, join, strip, replace), and re module pattern matching.',
      estimatedHours: 4.0,
      keywords: ['string', 'strings', 'regex', 'regular expression', 'slicing', 'text']
    },
    {
      moduleId: 'm08-python-data-structures-lists-tuples',
      title: 'Lists & Tuples',
      description: 'List operations, indexing, slicing, list methods, immutability of tuples, namedtuples, and tuple unpacking.',
      estimatedHours: 4.0,
      keywords: ['list', 'lists', 'tuple', 'tuples', 'sequence', 'slicing', 'unpacking']
    },
    {
      moduleId: 'm09-python-dictionaries-and-sets',
      title: 'Dictionaries & Sets',
      description: 'Hash map mechanics, dictionary methods, dict comprehension, set operations (union, intersection, difference), and frozensets.',
      estimatedHours: 4.5,
      keywords: ['dictionary', 'dictionaries', 'dict', 'set', 'sets', 'hash map', 'hash']
    },
    {
      moduleId: 'm10-python-oop-fundamentals',
      title: 'Object-Oriented Programming: Classes & Objects',
      description: 'Classes, instances, __init__, self, instance vs class attributes, class methods, static methods, and data encapsulation.',
      estimatedHours: 5.0,
      keywords: ['oop', 'class', 'classes', 'object', 'instance', 'self', 'init', 'constructor', 'encapsulation']
    },
    {
      moduleId: 'm11-python-oop-inheritance-dunder-methods',
      title: 'Advanced OOP: Inheritance & Dunder Methods',
      description: 'Single/multiple inheritance, super(), Method Resolution Order (MRO), polymorphism, and special dunder methods (__str__, __repr__, __len__, __getitem__).',
      estimatedHours: 5.0,
      keywords: ['inheritance', 'polymorphism', 'dunder', 'magic methods', 'super', 'mro', 'abstract']
    },
    {
      moduleId: 'm12-python-comprehensions-functional',
      title: 'Comprehensions & Functional Programming',
      description: 'List, dict, and set comprehensions, map(), filter(), reduce(), and functional paradigms.',
      estimatedHours: 4.0,
      keywords: ['comprehension', 'list comprehension', 'functional', 'map', 'filter', 'reduce']
    },
    {
      moduleId: 'm13-python-exception-handling',
      title: 'Exception Handling & Context Managers',
      description: 'try, except, else, finally, custom exceptions, with statement, and context managers.',
      estimatedHours: 4.0,
      keywords: ['exception', 'try', 'except', 'finally', 'raise', 'context manager', 'with']
    },
    {
      moduleId: 'm14-python-file-io-and-modules',
      title: 'File Handling & Modules',
      description: 'Reading/writing text and binary files, CSV handling, json module, import mechanics, packages, and virtual environments.',
      estimatedHours: 4.0,
      keywords: ['file', 'file handling', 'module', 'modules', 'json', 'csv', 'package', 'import']
    },
    {
      moduleId: 'm15-python-problem-solving-and-projects',
      title: 'Algorithmic Problem Solving & Projects',
      description: 'Coding challenges, algorithmic patterns, web scraping script, command-line utilities, and capstone software applications.',
      estimatedHours: 5.5,
      keywords: ['problem solving', 'project', 'projects', 'practice', 'capstone', 'challenge', 'algorithmic']
    }
  ],

  // DSA Core
  'dsa-core': [
    {
      moduleId: 'm01-algorithmic-complexity-and-foundations',
      title: 'Algorithmic Complexity & Foundations',
      description: 'Asymptotic notation, Big-O, Big-Omega, Big-Theta, best/average/worst case analysis, recursion trees, and master theorem.',
      estimatedHours: 4.0,
      keywords: ['complexity', 'big-o', 'time complexity', 'space complexity', 'asymptotic', 'master theorem']
    },
    {
      moduleId: 'm02-arrays-and-dynamic-arrays',
      title: 'Arrays & Two-Pointer Techniques',
      description: 'Memory layout, prefix sums, sliding window, two-pointer approach, Kadane’s algorithm, and dynamic array resizing.',
      estimatedHours: 5.5,
      keywords: ['array', 'arrays', 'two pointer', 'sliding window', 'prefix sum', 'kadane']
    },
    {
      moduleId: 'm03-matrix-and-multidimensional-arrays',
      title: 'Matrix & Multi-Dimensional Grid Operations',
      description: 'Row-major vs column-major order, spiral traversal, matrix rotation, search in 2D sorted matrices, and grid simulations.',
      estimatedHours: 4.5,
      keywords: ['matrix', '2d array', 'grid', 'spiral', 'rotation']
    },
    {
      moduleId: 'm04-strings-and-pattern-matching',
      title: 'Strings & String Algorithms',
      description: 'Character frequency arrays, palindromes, anagrams, sliding window on strings, KMP string matching, and Rabin-Karp hashing.',
      estimatedHours: 5.0,
      keywords: ['string', 'strings', 'palindrome', 'anagram', 'pattern matching', 'kmp', 'rabin-karp']
    },
    {
      moduleId: 'm05-recursion-and-backtracking',
      title: 'Recursion & Backtracking',
      description: 'Base cases, recursive call stack, subset generation, permutations, N-Queens problem, and Sudoku solver.',
      estimatedHours: 6.0,
      keywords: ['recursion', 'recursive', 'backtracking', 'subsets', 'permutations', 'n-queens', 'sudoku']
    },
    {
      moduleId: 'm06-searching-and-sorting-algorithms',
      title: 'Searching & Sorting Algorithms',
      description: 'Linear search, Binary search on arrays and answer spaces, Bubble, Selection, Insertion, Merge Sort, Quick Sort, and Counting Sort.',
      estimatedHours: 6.0,
      keywords: ['searching', 'sorting', 'binary search', 'merge sort', 'quick sort', 'counting sort', 'bubble sort', 'insertion sort', 'selection sort']
    },
    {
      moduleId: 'm07-singly-and-doubly-linked-lists',
      title: 'Linked Lists (Singly, Doubly & Circular)',
      description: 'Node architecture, insertion, deletion, reversal, Floyd’s cycle detection algorithm, fast & slow pointers, and merging sorted lists.',
      estimatedHours: 5.5,
      keywords: ['linked list', 'singly linked list', 'doubly linked list', 'circular linked list', 'node', 'cycle detection', 'floyd']
    },
    {
      moduleId: 'm08-stacks-and-monotonic-stacks',
      title: 'Stacks & Monotonic Stack Patterns',
      description: 'LIFO principle, array & linked-list implementations, balanced parentheses, Next Greater Element, and Largest Rectangle in Histogram.',
      estimatedHours: 5.0,
      keywords: ['stack', 'stacks', 'lifo', 'monotonic stack', 'next greater element', 'parentheses']
    },
    {
      moduleId: 'm09-queues-and-deques',
      title: 'Queues, Circular Queues & Deques',
      description: 'FIFO principle, circular queue, deque, queue using stacks, sliding window maximum, and BFS queue mechanics.',
      estimatedHours: 4.5,
      keywords: ['queue', 'queues', 'deque', 'circular queue', 'fifo', 'sliding window maximum']
    },
    {
      moduleId: 'm10-hash-tables-and-hashing',
      title: 'Hash Tables & Hash Maps',
      description: 'Hash functions, collision resolution (chaining, open addressing), HashSet, HashMap internals, and frequency counting.',
      estimatedHours: 5.0,
      keywords: ['hash', 'hashing', 'hash table', 'hash map', 'hashset', 'collision']
    },
    {
      moduleId: 'm11-binary-trees-and-traversals',
      title: 'Binary Trees & Tree Traversals',
      description: 'Binary tree representation, recursive & iterative traversals (preorder, inorder, postorder, level order), height, diameter, and views (top, bottom, left, right).',
      estimatedHours: 6.0,
      keywords: ['tree', 'trees', 'binary tree', 'traversal', 'inorder', 'preorder', 'postorder', 'level order', 'diameter', 'height']
    },
    {
      moduleId: 'm12-binary-search-trees',
      title: 'Binary Search Trees (BST)',
      description: 'BST property, search, insert, delete, Lowest Common Ancestor (LCA), validate BST, and construct BST from traversals.',
      estimatedHours: 5.0,
      keywords: ['bst', 'binary search tree', 'lca', 'lowest common ancestor', 'validate bst']
    },
    {
      moduleId: 'm13-heaps-and-priority-queues',
      title: 'Heaps & Priority Queues',
      description: 'Min-heap, max-heap, heapify, heap sort, priority queue operations, and Top K frequent elements.',
      estimatedHours: 5.0,
      keywords: ['heap', 'heaps', 'priority queue', 'min-heap', 'max-heap', 'heapify', 'heap sort']
    },
    {
      moduleId: 'm14-graphs-foundations-and-bfs-dfs',
      title: 'Graph Foundations & Traversals (BFS & DFS)',
      description: 'Adjacency matrix vs adjacency list, Breadth-First Search (BFS), Depth-First Search (DFS), connected components, and cycle detection in directed/undirected graphs.',
      estimatedHours: 6.0,
      keywords: ['graph', 'graphs', 'bfs', 'dfs', 'adjacency list', 'breadth first search', 'depth first search', 'cycle detection']
    },
    {
      moduleId: 'm15-advanced-graph-algorithms',
      title: 'Advanced Graph Algorithms & Shortest Paths',
      description: 'Dijkstra’s algorithm, Bellman-Ford, Floyd-Warshall, Prim’s & Kruskal’s Minimum Spanning Tree (MST), Topological Sort, and Kahn’s algorithm.',
      estimatedHours: 6.5,
      keywords: ['dijkstra', 'bellman-ford', 'floyd-warshall', 'mst', 'minimum spanning tree', 'kruskal', 'prim', 'topological sort', 'kahns']
    },
    {
      moduleId: 'm16-greedy-algorithms',
      title: 'Greedy Algorithms & Interval Scheduling',
      description: 'Greedy choice property, Activity Selection, Fractional Knapsack, Huffman Coding, and interval merging.',
      estimatedHours: 4.5,
      keywords: ['greedy', 'activity selection', 'fractional knapsack', 'huffman', 'intervals']
    },
    {
      moduleId: 'm17-dynamic-programming-1d',
      title: 'Dynamic Programming: 1D DP Patterns',
      description: 'Memoization (top-down) vs Tabulation (bottom-up), Fibonacci, Climbing Stairs, House Robber, Coin Change, and Longest Increasing Subsequence (LIS).',
      estimatedHours: 6.5,
      keywords: ['dynamic programming', 'dp', '1d dp', 'memoization', 'tabulation', 'climbing stairs', 'house robber', 'coin change', 'lis']
    },
    {
      moduleId: 'm18-dynamic-programming-2d-and-grids',
      title: 'Dynamic Programming: 2D, Grids & Strings',
      description: 'Grid unique paths, Minimum Path Sum, 0/1 Knapsack problem, Longest Common Subsequence (LCS), Edit Distance, and Partition DP.',
      estimatedHours: 7.0,
      keywords: ['2d dp', 'knapsack', 'lcs', 'longest common subsequence', 'edit distance', 'grid dp', 'partition dp']
    },
    {
      moduleId: 'm19-bit-manipulation',
      title: 'Bit Manipulation & Binary Operations',
      description: 'Bitwise AND, OR, XOR, NOT, left/right shifts, bitmasking, Single Number, Counting Bits, and power of two checks.',
      estimatedHours: 4.0,
      keywords: ['bit', 'bits', 'bit manipulation', 'bitwise', 'bitmask', 'xor']
    },
    {
      moduleId: 'm20-tries-and-disjoint-set-union',
      title: 'Tries & Disjoint Set Union (DSU)',
      description: 'Prefix tree (Trie) insertion, search, prefix matching, Disjoint Set Union with path compression and union by rank, and Kruskal’s integration.',
      estimatedHours: 5.0,
      keywords: ['trie', 'tries', 'prefix tree', 'dsu', 'disjoint set', 'union find', 'path compression']
    }
  ],

  // SQL & Databases
  sql: [
    {
      moduleId: 'm01-sql-foundations-and-relational-model',
      title: 'Relational Database Foundations & SQL Basics',
      description: 'RDBMS concepts, tables, rows, columns, primary keys, foreign keys, SQL dialect overview, and basic SELECT syntax.',
      estimatedHours: 3.0,
      keywords: ['introduction', 'foundations', 'rdbms', 'relational', 'table', 'select', 'syntax']
    },
    {
      moduleId: 'm02-sql-filtering-and-sorting',
      title: 'Filtering & Sorting Queries (WHERE, ORDER BY, DISTINCT)',
      description: 'WHERE clause, comparison operators, logical operators (AND, OR, NOT), ORDER BY ascending/descending, LIMIT, and DISTINCT values.',
      estimatedHours: 3.5,
      keywords: ['filtering', 'where', 'order by', 'distinct', 'limit', 'sorting']
    },
    {
      moduleId: 'm03-sql-operators-and-null-handling',
      title: 'SQL Operators & Pattern Matching (LIKE, IN, BETWEEN, NULL)',
      description: 'Wildcards (% and _) with LIKE/ILIKE, IN and NOT IN lists, BETWEEN ranges, and IS NULL / IS NOT NULL handling with COALESCE.',
      estimatedHours: 3.5,
      keywords: ['like', 'in', 'between', 'null', 'is null', 'coalesce', 'wildcards', 'pattern matching']
    },
    {
      moduleId: 'm04-sql-aggregate-functions-and-grouping',
      title: 'Aggregate Functions & Grouping (GROUP BY & HAVING)',
      description: 'COUNT, SUM, AVG, MIN, MAX aggregations, GROUP BY single and multiple columns, and filtering aggregated groups with HAVING.',
      estimatedHours: 4.0,
      keywords: ['aggregate', 'aggregation', 'count', 'sum', 'avg', 'min', 'max', 'group by', 'having']
    },
    {
      moduleId: 'm05-sql-joins-mastery',
      title: 'Relational Joins Mastery',
      description: 'INNER JOIN, LEFT (OUTER) JOIN, RIGHT (OUTER) JOIN, FULL OUTER JOIN, CROSS JOIN, and self-joins with alias handling.',
      estimatedHours: 5.0,
      keywords: ['join', 'joins', 'inner join', 'left join', 'right join', 'full join', 'cross join', 'self join']
    },
    {
      moduleId: 'm06-sql-subqueries-and-nested-queries',
      title: 'Subqueries & Nested Queries',
      description: 'Single-row subqueries, multi-row subqueries (IN, ANY, ALL), correlated subqueries, EXISTS, and NOT EXISTS clauses.',
      estimatedHours: 4.5,
      keywords: ['subquery', 'subqueries', 'nested query', 'correlated', 'exists', 'not exists']
    },
    {
      moduleId: 'm07-sql-built-in-functions',
      title: 'String, Date & Mathematical Functions',
      description: 'String manipulation (CONCAT, SUBSTRING, LENGTH, UPPER, LOWER), date calculations (NOW, DATEADD, DATEDIFF, EXTRACT), and numeric roundings.',
      estimatedHours: 3.5,
      keywords: ['function', 'functions', 'string functions', 'date', 'math functions', 'concat', 'substring']
    },
    {
      moduleId: 'm08-sql-dml-operations',
      title: 'Data Manipulation Language (INSERT, UPDATE, DELETE)',
      description: 'Inserting single/multiple records, conditional UPDATE statements, DELETE vs TRUNCATE, and UPSERT operations.',
      estimatedHours: 3.5,
      keywords: ['dml', 'insert', 'update', 'delete', 'truncate', 'upsert']
    },
    {
      moduleId: 'm09-sql-ddl-and-schema-design',
      title: 'Data Definition Language & Schema Integrity',
      description: 'CREATE TABLE, ALTER TABLE, DROP TABLE, data types, constraints (PRIMARY KEY, FOREIGN KEY, UNIQUE, NOT NULL, CHECK, DEFAULT).',
      estimatedHours: 4.0,
      keywords: ['ddl', 'create table', 'alter table', 'drop table', 'constraints', 'primary key', 'foreign key']
    },
    {
      moduleId: 'm10-sql-views-indexes-and-performance',
      title: 'Views, Indexes & Query Optimization',
      description: 'Creating and managing Views, clustered vs non-clustered B-Tree indexes, EXPLAIN query plans, and query performance tuning.',
      estimatedHours: 4.5,
      keywords: ['view', 'views', 'index', 'indexes', 'performance', 'explain', 'optimization', 'b-tree']
    },
    {
      moduleId: 'm11-sql-advanced-window-functions',
      title: 'Advanced SQL: Window & Analytic Functions',
      description: 'OVER() clause, PARTITION BY, ORDER BY frames, ROW_NUMBER(), RANK(), DENSE_RANK(), NTILE(), LAG(), and LEAD().',
      estimatedHours: 5.5,
      keywords: ['window function', 'analytic function', 'row_number', 'rank', 'dense_rank', 'lead', 'lag', 'partition by']
    },
    {
      moduleId: 'm12-sql-common-table-expressions-cte',
      title: 'Common Table Expressions (CTE) & Recursion',
      description: 'Non-recursive CTEs with WITH clause, multiple CTEs, recursive CTEs for hierarchical organizational trees and graph querying.',
      estimatedHours: 4.5,
      keywords: ['cte', 'common table expression', 'with clause', 'recursive cte', 'hierarchy']
    },
    {
      moduleId: 'm13-sql-transactions-acid-concurrency',
      title: 'Transactions, ACID Properties & Concurrency',
      description: 'Transaction lifecycle, COMMIT, ROLLBACK, SAVEPOINT, ACID guarantees, dirty reads, non-repeatable reads, phantom reads, and isolation levels.',
      estimatedHours: 4.0,
      keywords: ['transaction', 'transactions', 'acid', 'commit', 'rollback', 'savepoint', 'isolation level']
    },
    {
      moduleId: 'm14-sql-case-studies-and-interview-drills',
      title: 'Real-World Database Case Studies & Drills',
      description: 'E-commerce order analytics, user churn cohorts, financial balance audits, and FAANG SQL interview question sets.',
      estimatedHours: 5.5,
      keywords: ['case study', 'interview', 'practice', 'drills', 'analytics', 'e-commerce', 'problem solving']
    }
  ]
};

// Routing logic: assign a raw topic to the best canonical module
function routeTopicToCanonicalModule(topic, canonicalModules, defaultModuleIndex = 0) {
  const tTitle = (topic.title || '').toLowerCase();
  const tDesc = (topic.description || '').toLowerCase();
  const tModTitle = (topic._moduleTitle || '').toLowerCase();
  const combinedText = `${tTitle} ${tDesc} ${tModTitle}`;

  let bestIndex = -1;
  let maxScore = 0;

  for (let i = 0; i < canonicalModules.length; i++) {
    const mod = canonicalModules[i];
    let score = 0;

    for (const kw of mod.keywords) {
      const lowerKw = kw.toLowerCase();
      if (tTitle.includes(lowerKw)) score += 5;
      else if (tModTitle.includes(lowerKw)) score += 3;
      else if (tDesc.includes(lowerKw)) score += 1;
    }

    if (score > maxScore) {
      maxScore = score;
      bestIndex = i;
    }
  }

  return bestIndex !== -1 ? bestIndex : defaultModuleIndex;
}

// Intelligent topic merger to prevent any duplicate topics within a module
function mergeTopics(existingTopic, newTopic) {
  // Merge pages: keep the richest pages array
  const existingPages = existingTopic.pages || [];
  const newPages = newTopic.pages || [];
  if (newPages.length > existingPages.length) {
    existingTopic.pages = newPages;
  }

  // Merge code examples
  const exMap = new Map();
  for (const ex of (existingTopic.codeExamples || [])) {
    const key = (ex.title || ex.code || '').trim();
    if (key) exMap.set(key, ex);
  }
  for (const ex of (newTopic.codeExamples || [])) {
    const key = (ex.title || ex.code || '').trim();
    if (key && !exMap.has(key)) {
      exMap.set(key, ex);
    }
  }
  existingTopic.codeExamples = Array.from(exMap.values());

  // Merge practice problems
  const probMap = new Map();
  for (const p of (existingTopic.practiceProblems || [])) {
    const key = (p.id || p.title || p.problemStatement || '').trim();
    if (key) probMap.set(key, p);
  }
  for (const p of (newTopic.practiceProblems || [])) {
    const key = (p.id || p.title || p.problemStatement || '').trim();
    if (key && !probMap.has(key)) {
      probMap.set(key, p);
    }
  }
  existingTopic.practiceProblems = Array.from(probMap.values());

  // Merge reading time
  existingTopic.readingTimeMinutes = Math.max(
    existingTopic.readingTimeMinutes || 10,
    newTopic.readingTimeMinutes || 10
  );

  // Preserve description
  if (!existingTopic.description && newTopic.description) {
    existingTopic.description = newTopic.description;
  }

  // Set mode
  if (existingTopic.pages.length > 0) existingTopic.mode = 'TEXT';
  else if (existingTopic.practiceProblems.length > 0) existingTopic.mode = 'PRACTICE';
  else existingTopic.mode = 'TEXT';

  return existingTopic;
}

// Master Course Source Mappings
const COURSE_SOURCE_MAPPINGS = [
  // --- 01. PROGRAMMING ---
  {
    domainId: '01-programming',
    courseId: 'cpp',
    slug: 'cpp',
    folder: 'cpp',
    title: 'C++ Programming',
    description: 'Modern C++ engineering covering OOP, STL algorithms, move semantics, template metaprogramming, and production application building.',
    category: 'Programming Languages',
    level: 'Beginner to Expert',
    estimatedHours: 65,
    sourceFiles: ['cpp-development.json', 'cpp.json', 'college-oops-cpp.json', 'college-programming-cpp.json', 'cpp-stl.json', 'cpp-beginner-v2-p1.json', 'cpp-beginner-v2-p2.json']
  },
  {
    domainId: '01-programming',
    courseId: 'c',
    slug: 'c',
    folder: 'c',
    title: 'C Programming',
    description: 'Master low-level systems programming, pointer mechanics, manual memory management, and data structures in C.',
    category: 'Programming Languages',
    level: 'Beginner to Advanced',
    estimatedHours: 40,
    sourceFiles: ['c.json', 'c-beginner-v2-p1.json', 'c-beginner-v2-p2.json', 'college-programming-c.json']
  },
  {
    domainId: '01-programming',
    courseId: 'java',
    slug: 'java',
    folder: 'java',
    title: 'Java Programming',
    description: 'Enterprise Java engineering covering JVM architecture, OOP, Collections Framework, Streams, Concurrency, and full-stack projects.',
    category: 'Programming Languages',
    level: 'Beginner to Expert',
    estimatedHours: 60,
    sourceFiles: ['java-development.json', 'java.json', 'college-oops-java.json', 'advance-java.json', 'java-beginner-v2-p1.json', 'java-beginner-v2-p2.json']
  },
  {
    domainId: '01-programming',
    courseId: 'python',
    slug: 'python',
    folder: 'python',
    title: 'Python Programming',
    description: 'Python mastery from basic syntax to advanced OOP, functional programming, memory models, and algorithmic problem solving.',
    category: 'Programming Languages',
    level: 'Beginner to Advanced',
    estimatedHours: 45,
    sourceFiles: ['oops-concepts-in-python.json', 'python-beginner-v2-p1.json', 'python-beginner-v2-p2.json', 'advanced-python.json']
  },
  {
    domainId: '01-programming',
    courseId: 'javascript',
    slug: 'javascript',
    folder: 'javascript',
    title: 'JavaScript Programming',
    description: 'Deep dive into modern JavaScript runtimes, asynchronous event loops, prototypes, ES6+ semantics, and memory profiling.',
    category: 'Programming Languages',
    level: 'Beginner to Advanced',
    estimatedHours: 45,
    sourceFiles: ['javascript.json', 'advanced-javascript.json']
  },
  {
    domainId: '01-programming',
    courseId: 'csharp',
    slug: 'csharp',
    folder: 'csharp',
    title: 'C# Programming',
    description: 'Modern .NET and C# programming covering CLR fundamentals, LINQ, OOP, async/await patterns, and enterprise software design.',
    category: 'Programming Languages',
    level: 'Beginner to Advanced',
    estimatedHours: 40,
    sourceFiles: ['c-sharp.json', 'c-sharp-beginner-part-1.json']
  },
  {
    domainId: '01-programming',
    courseId: 'go',
    slug: 'go',
    folder: 'go',
    title: 'Go Programming',
    description: 'Concurrent backend systems and high-throughput microservices using Go, goroutines, channels, and idiomatic Go architecture.',
    category: 'Programming Languages',
    level: 'Intermediate',
    estimatedHours: 35,
    sourceFiles: ['go.json']
  },
  {
    domainId: '01-programming',
    courseId: 'rust',
    slug: 'rust',
    folder: 'rust',
    title: 'Rust Programming',
    description: 'Memory safety without garbage collection, borrow checker semantics, fearless concurrency, and zero-cost abstractions in Rust.',
    category: 'Programming Languages',
    level: 'Intermediate to Advanced',
    estimatedHours: 45,
    sourceFiles: ['rust.json']
  },
  {
    domainId: '01-programming',
    courseId: 'php',
    slug: 'php',
    folder: 'php',
    title: 'PHP Modern Web Programming',
    description: 'Server-side web development using modern PHP, MVC architecture, OOP, PDO database connectivity, and secure API construction.',
    category: 'Programming Languages',
    level: 'Beginner to Intermediate',
    estimatedHours: 35,
    sourceFiles: ['php.json']
  },
  {
    domainId: '01-programming',
    courseId: 'r',
    slug: 'r',
    folder: 'r',
    title: 'R Programming for Data Science',
    description: 'Statistical computing, exploratory data analysis, data frame transformations, and visualization in R.',
    category: 'Programming Languages',
    level: 'Beginner to Intermediate',
    estimatedHours: 35,
    sourceFiles: ['r.json']
  },

  // --- 02. DATA STRUCTURES & ALGORITHMS ---
  {
    domainId: '02-dsa',
    courseId: 'dsa-foundation',
    slug: 'dsa-foundation',
    folder: 'dsa-foundation',
    title: 'DSA Foundation: Time & Space Complexity',
    description: 'Asymptotic notation, Big-O, Big-Omega, Big-Theta, master theorem, and rigorous mathematical runtime complexity analysis.',
    category: 'Data Structures & Algorithms',
    level: 'Beginner to Intermediate',
    estimatedHours: 20,
    sourceFiles: ['time-complexity.json']
  },
  {
    domainId: '02-dsa',
    courseId: 'dsa-core',
    slug: 'dsa-core',
    folder: 'dsa-core',
    title: 'Data Structures & Algorithms Core',
    description: 'Comprehensive DSA curriculum covering Arrays, Linked Lists, Stacks, Queues, Trees, BSTs, Heaps, Graphs, Hashing, Recursion, Sorting, Searching, and Dynamic Programming with multi-language implementations.',
    category: 'Data Structures & Algorithms',
    level: 'Beginner to Advanced',
    estimatedHours: 85,
    sourceFiles: [
      'dsa.json', 'arrays.json', 'linked-lists-new.json', 'stacks-and-queues-new.json',
      'trees-new.json', 'graphs-new.json', 'dynamic-programming-new.json', 'greedy-algorithms.json',
      'searching-sorting-new.json', 'sorting-intermediate.json', 'bit-manipulation.json',
      'recursion-new.json', 'hashing.json', 'heaps.json', 'tries.json', 'dsu.json',
      'binary-search-new.json'
    ]
  },
  {
    domainId: '02-dsa',
    courseId: 'dsa-problem-solving',
    slug: 'dsa-problem-solving',
    folder: 'dsa-problem-solving',
    title: 'DSA Problem Solving & Binary Search Patterns',
    description: 'Intensive pattern-based problem solving, answer space binary search, two pointers, sliding window, and monotonic queue problems.',
    category: 'Data Structures & Algorithms',
    level: 'Intermediate to Advanced',
    estimatedHours: 50,
    sourceFiles: ['binary-search-new.json', 'c-beginner-v2-p1.json', 'c-beginner-v2-p2.json']
  },
  {
    domainId: '02-dsa',
    courseId: 'advanced-dsa',
    slug: 'advanced-dsa',
    folder: 'advanced-dsa',
    title: 'Advanced DSA & Graph Theory',
    description: 'Advanced graph algorithms, network flow, bridges, articulation points, Tarjan’s algorithm, Fenwick trees, and Segment trees.',
    category: 'Data Structures & Algorithms',
    level: 'Advanced',
    estimatedHours: 45,
    sourceFiles: ['graphs-advanced.json']
  },
  {
    domainId: '02-dsa',
    courseId: 'competitive-programming',
    slug: 'competitive-programming',
    folder: 'competitive-programming',
    title: 'Competitive Programming: Math & Combinatorics',
    description: 'Number theory, modular arithmetic, Fermat’s Little Theorem, sieve of Eratosthenes, combinatorics, and dynamic programming optimizations.',
    category: 'Data Structures & Algorithms',
    level: 'Advanced',
    estimatedHours: 45,
    sourceFiles: ['number-theory.json', 'combinatorics.json']
  },
  {
    domainId: '02-dsa',
    courseId: 'advanced-competitive-programming',
    slug: 'advanced-competitive-programming',
    folder: 'advanced-competitive-programming',
    title: 'Advanced Competitive Programming & DP',
    description: 'Advanced dynamic programming on trees, digit DP, bitmask DP, and competitive contest problem sets.',
    category: 'Data Structures & Algorithms',
    level: 'Expert',
    estimatedHours: 40,
    sourceFiles: ['dynamic-programming-advanced.json']
  },

  // --- 03. WEB DEVELOPMENT ---
  {
    domainId: '03-web-development',
    courseId: 'html',
    slug: 'html',
    folder: 'html',
    title: 'HTML Foundations & Semantic Web',
    description: 'Modern semantic HTML5, accessible markup (ARIA), forms, media elements, SEO best practices, and document structure.',
    category: 'Web Development',
    level: 'Beginner',
    estimatedHours: 25,
    sourceFiles: ['html.json']
  },
  {
    domainId: '03-web-development',
    courseId: 'css',
    slug: 'css',
    folder: 'css',
    title: 'CSS & Modern Responsive Design',
    description: 'CSS box model, Flexbox, CSS Grid, custom properties, animations, transitions, and mobile-first responsive architecture.',
    category: 'Web Development',
    level: 'Beginner to Intermediate',
    estimatedHours: 35,
    sourceFiles: ['css.json']
  },
  {
    domainId: '03-web-development',
    courseId: 'javascript-web',
    slug: 'javascript-web',
    folder: 'javascript-web',
    title: 'JavaScript for Web Developers',
    description: 'DOM manipulation, browser event listeners, Fetch API, async/await, Web Storage, and dynamic client-side interactions.',
    category: 'Web Development',
    level: 'Intermediate',
    estimatedHours: 35,
    sourceFiles: ['web-dev-js.json']
  },
  {
    domainId: '03-web-development',
    courseId: 'react',
    slug: 'react',
    folder: 'react',
    title: 'React.js Component Architecture',
    description: 'Modern functional React, hooks (useState, useEffect, useMemo, useCallback), custom hooks, Context API, and state management.',
    category: 'Web Development',
    level: 'Intermediate to Advanced',
    estimatedHours: 50,
    sourceFiles: ['react-js.json']
  },
  {
    domainId: '03-web-development',
    courseId: 'nodejs',
    slug: 'nodejs',
    folder: 'nodejs',
    title: 'Node.js Backend Runtimes & APIs',
    description: 'Asynchronous event loop, Streams, Buffer, HTTP server, RESTful API design, middleware patterns, and NPM ecosystem.',
    category: 'Web Development',
    level: 'Intermediate',
    estimatedHours: 40,
    sourceFiles: ['nodejs.json']
  },
  {
    domainId: '03-web-development',
    courseId: 'springboot',
    slug: 'springboot',
    folder: 'springboot',
    title: 'Spring Boot Enterprise Backend',
    description: 'Enterprise Java with Spring Boot, Spring Data JPA, Hibernate, REST controllers, Spring Security, and Maven.',
    category: 'Web Development',
    level: 'Intermediate to Advanced',
    estimatedHours: 50,
    sourceFiles: ['springboot.json']
  },
  {
    domainId: '03-web-development',
    courseId: 'django',
    slug: 'django',
    folder: 'django',
    title: 'Django Full-Stack Web Framework',
    description: 'Full-stack Python with Django, ORM models, MVT architecture, forms, authentication, Django REST framework, and admin panels.',
    category: 'Web Development',
    level: 'Intermediate',
    estimatedHours: 45,
    sourceFiles: ['django.json']
  },
  {
    domainId: '03-web-development',
    courseId: 'flask',
    slug: 'flask',
    folder: 'flask',
    title: 'Flask Microframework Web Engineering',
    description: 'Microservices with Python Flask, Jinja2 templating, SQLAlchemy ORM, blueprints, and REST API development.',
    category: 'Web Development',
    level: 'Beginner to Intermediate',
    estimatedHours: 35,
    sourceFiles: ['flask.json']
  },
  {
    domainId: '03-web-development',
    courseId: 'ux',
    slug: 'ux',
    folder: 'ux',
    title: 'UI/UX Design for Web Developers',
    description: 'User experience principles, accessibility standards (WCAG), wireframing, color theory, typography, and visual hierarchy.',
    category: 'Web Development',
    level: 'Beginner',
    estimatedHours: 20,
    sourceFiles: ['ux.json']
  },

  // --- 04. DATABASES ---
  {
    domainId: '04-databases',
    courseId: 'sql',
    slug: 'sql',
    folder: 'sql',
    title: 'Interactive SQL Mastery & Database Systems',
    description: 'Production database engineering covering basic queries, multi-table joins, subqueries, CTEs, window functions, and indexing.',
    category: 'Database Systems',
    level: 'Beginner to Advanced',
    estimatedHours: 45,
    sourceFiles: ['sql-interactive.json', 'sql-intermediate.json', 'sql-at-work.json', 'pl-sql.json']
  },

  // --- 05. COMPUTER SCIENCE ---
  {
    domainId: '05-computer-science',
    courseId: 'operating-systems',
    slug: 'operating-systems',
    folder: 'operating-systems',
    title: 'Operating Systems Mastery',
    description: 'Processes, threads, CPU scheduling algorithms, synchronization (semaphores, mutexes), deadlocks, memory virtualization, and paging.',
    category: 'Core Computer Science',
    level: 'Intermediate',
    estimatedHours: 45,
    sourceFiles: ['operating-system.json']
  },

  // --- 07. AI & MACHINE LEARNING ---
  {
    domainId: '07-ai-ml',
    courseId: 'machine-learning',
    slug: 'machine-learning',
    folder: 'machine-learning',
    title: 'Machine Learning Engineering',
    description: 'Supervised & unsupervised learning, NumPy array computation, Pandas dataframes, Matplotlib visualization, Scikit-learn models, and evaluation metrics.',
    category: 'Artificial Intelligence & ML',
    level: 'Intermediate to Advanced',
    estimatedHours: 55,
    sourceFiles: ['machine-learning.json', 'numpy.json', 'pandas.json', 'matplotlib.json']
  },
  {
    domainId: '07-ai-ml',
    courseId: 'deep-learning',
    slug: 'deep-learning',
    folder: 'deep-learning',
    title: 'Deep Learning & Neural Architectures',
    description: 'Perceptrons, backpropagation, convolutional neural networks (CNNs), recurrent networks (RNN/LSTM), attention mechanisms, and PyTorch.',
    category: 'Artificial Intelligence & ML',
    level: 'Advanced',
    estimatedHours: 50,
    sourceFiles: ['deep-learning-ai.json']
  },

  // --- 08. CLOUD & DEVOPS ---
  {
    domainId: '08-cloud-devops',
    courseId: 'git-github',
    slug: 'git-github',
    folder: 'git-github',
    title: 'Git & GitHub Collaboration Mastery',
    description: 'Version control internals, commit graphs, branching workflows, merge conflicts, interactive rebasing, GitHub PRs, and CI actions.',
    category: 'Cloud & DevOps',
    level: 'Beginner to Intermediate',
    estimatedHours: 30,
    sourceFiles: ['git-github.json']
  },

  // --- 09. MOBILE DEVELOPMENT ---
  {
    domainId: '09-mobile-development',
    courseId: 'kotlin',
    slug: 'kotlin',
    folder: 'kotlin',
    title: 'Kotlin Mobile & Systems Engineering',
    description: 'Kotlin language mastery, null safety, coroutines, Android architecture components, and mobile algorithmic problem solving.',
    category: 'Mobile Development',
    level: 'Beginner to Advanced',
    estimatedHours: 40,
    sourceFiles: ['kotlin.json', 'kotlin-beginner-part-1.json', 'kotlin-beginner-part-2.json']
  }
];

// Reorganize and Hydrate Function
async function reorganizeAllCourses() {
  console.log('\n🚀 Starting Canonical Course Reorganization & Deduplication...');

  let totalCoursesProcessed = 0;
  let totalModulesGenerated = 0;
  let totalTopicsDeduplicated = 0;

  for (const cDef of COURSE_SOURCE_MAPPINGS) {
    const courseDir = path.join(CATALOG_DIR, cDef.domainId, cDef.folder);
    const modulesDir = path.join(courseDir, 'modules');
    ensureDir(modulesDir);

    // 1. Gather all raw topics from all assigned source files
    const allRawTopics = [];
    for (const srcFile of cDef.sourceFiles) {
      const srcData = realCourseDataMap.get(srcFile);
      if (!srcData) continue;

      const rawModules = srcData.modules || (srcData.curriculum ? srcData.curriculum.modules : []) || [];
      for (const m of rawModules) {
        const rawTs = m.topics || m.lessons || [];
        for (const t of rawTs) {
          allRawTopics.push({
            ...t,
            _sourceFile: srcFile,
            _moduleTitle: m.title
          });
        }
      }
    }

    if (allRawTopics.length === 0) {
      console.warn(`⚠️  No topics found for ${cDef.courseId}, skipping.`);
      continue;
    }

    // 2. Check if a canonical schema exists for this course
    const schema = CANONICAL_SCHEMAS[cDef.courseId];
    let finalModules = [];

    if (schema) {
      // Initialize canonical modules with clean containers
      const moduleBuckets = schema.map(s => ({
        moduleId: s.moduleId,
        title: s.title,
        description: s.description,
        estimatedHours: s.estimatedHours,
        topicsMap: new Map() // normTitle -> Topic Object
      }));

      // Route every raw topic into its canonical module
      for (const rawTopic of allRawTopics) {
        const bucketIndex = routeTopicToCanonicalModule(rawTopic, schema, 0);
        const targetBucket = moduleBuckets[bucketIndex];
        const normKey = normalizeTitle(rawTopic.title).toLowerCase();

        // Enrich with global topic index if needed
        let enriched = { ...rawTopic };
        if (!enriched.pages || enriched.pages.length === 0) {
          const match = (enriched.topicId && globalTopicIndex.get(enriched.topicId)) ||
                        globalTopicIndex.get(`title:${(enriched.title || '').trim().toLowerCase()}`);
          if (match) {
            if (match.pages && match.pages.length > 0) enriched.pages = match.pages;
            if (match.codeExamples && match.codeExamples.length > 0) enriched.codeExamples = match.codeExamples;
            if (match.practiceProblems && match.practiceProblems.length > 0) enriched.practiceProblems = match.practiceProblems;
          }
        }
        if (!enriched.pages) enriched.pages = [];
        if (!enriched.codeExamples) enriched.codeExamples = [];
        if (!enriched.practiceProblems) enriched.practiceProblems = [];

        // Check if topic is a generic duplicate name like "practice problems" or "concept & practice"
        const isGenericName = /^(practice problems?|concept & practice|additional practice|bonus practice problems?)$/i.test(enriched.title.trim());

        if (targetBucket.topicsMap.has(normKey) && !isGenericName) {
          // Merge with existing topic
          const existing = targetBucket.topicsMap.get(normKey);
          mergeTopics(existing, enriched);
        } else if (isGenericName && targetBucket.topicsMap.size > 0) {
          // Attach practice problems to the most recent conceptual topic or create clean practice lab
          const lastTopic = Array.from(targetBucket.topicsMap.values()).pop();
          if (enriched.practiceProblems && enriched.practiceProblems.length > 0) {
            mergeTopics(lastTopic, enriched);
          }
        } else {
          // Insert clean unique topic
          const cleanTitle = normalizeTitle(enriched.title);
          enriched.title = cleanTitle.length > 0 ? cleanTitle : enriched.title;
          enriched.topicId = `${targetBucket.moduleId}-t${String(targetBucket.topicsMap.size + 1).padStart(2, '0')}-${slugify(enriched.title)}`;
          targetBucket.topicsMap.set(normKey, enriched);
        }
      }

      // Convert module buckets to final modules (only keep non-empty modules)
      finalModules = moduleBuckets
        .map((b, idx) => {
          const topics = Array.from(b.topicsMap.values());
          if (topics.length === 0) return null;

          // Re-index topic IDs for clean sequential ordering
          topics.forEach((t, tIdx) => {
            t.topicId = `t${String(tIdx + 1).padStart(2, '0')}-${slugify(t.title)}`;
          });

          return {
            moduleId: `m${String(idx + 1).padStart(2, '0')}-${slugify(b.title)}`,
            title: b.title,
            description: b.description,
            estimatedHours: b.estimatedHours,
            topics
          };
        })
        .filter(Boolean);

    } else {
      // For courses without an explicit canonical schema, group modules by normalized title
      // and deduplicate topics within each module
      const moduleMap = new Map();

      for (const rawTopic of allRawTopics) {
        const modTitle = rawTopic._moduleTitle || 'Core Concepts';
        const modKey = normalizeTitle(modTitle).toLowerCase();

        if (!moduleMap.has(modKey)) {
          moduleMap.set(modKey, {
            title: modTitle,
            description: `Core concepts and hands-on practice in ${modTitle}.`,
            estimatedHours: 3.0,
            topicsMap: new Map()
          });
        }

        const targetMod = moduleMap.get(modKey);
        const normKey = normalizeTitle(rawTopic.title).toLowerCase();

        let enriched = { ...rawTopic };
        if (!enriched.pages) enriched.pages = [];
        if (!enriched.codeExamples) enriched.codeExamples = [];
        if (!enriched.practiceProblems) enriched.practiceProblems = [];

        if (targetMod.topicsMap.has(normKey)) {
          const existing = targetMod.topicsMap.get(normKey);
          mergeTopics(existing, enriched);
        } else {
          const cleanTitle = normalizeTitle(enriched.title);
          enriched.title = cleanTitle.length > 0 ? cleanTitle : enriched.title;
          targetMod.topicsMap.set(normKey, enriched);
        }
      }

      finalModules = Array.from(moduleMap.values()).map((m, idx) => {
        const topics = Array.from(m.topicsMap.values());
        topics.forEach((t, tIdx) => {
          t.topicId = `t${String(tIdx + 1).padStart(2, '0')}-${slugify(t.title)}`;
        });

        return {
          moduleId: `m${String(idx + 1).padStart(2, '0')}-${slugify(m.title)}`,
          title: m.title,
          description: m.description,
          estimatedHours: m.estimatedHours,
          topics
        };
      });
    }

    // 3. Clean up old mini-module files in modules/ directory
    if (fs.existsSync(modulesDir)) {
      const existingFiles = fs.readdirSync(modulesDir);
      for (const ef of existingFiles) {
        if (ef.endsWith('.json')) {
          fs.unlinkSync(path.join(modulesDir, ef));
        }
      }
    }

    // 4. Write new clean canonical mini-module files
    const manifestModules = [];
    let courseTopicsCount = 0;

    for (const mod of finalModules) {
      const moduleFileName = `${mod.moduleId}.json`;
      const moduleFilePath = path.join(modulesDir, moduleFileName);

      fs.writeFileSync(moduleFilePath, JSON.stringify(mod, null, 2), 'utf8');

      manifestModules.push({
        moduleId: mod.moduleId,
        title: mod.title,
        description: mod.description,
        estimatedHours: mod.estimatedHours,
        topicsCount: mod.topics.length,
        moduleFile: `modules/${moduleFileName}`
      });

      courseTopicsCount += mod.topics.length;
      totalModulesGenerated++;
    }

    // 5. Update course.json manifest
    const manifestPath = path.join(courseDir, 'course.json');
    let existingManifest = loadJson(manifestPath) || {};

    const updatedManifest = {
      courseId: cDef.courseId,
      id: cDef.courseId,
      slug: cDef.slug,
      title: cDef.title,
      description: cDef.description,
      category: cDef.category,
      level: cDef.level,
      enabled: true,
      enrolledCount: existingManifest.enrolledCount || 1050,
      rating: existingManifest.rating || 4.9,
      reviewsCount: existingManifest.reviewsCount || 3,
      reviews: existingManifest.reviews || [],
      skills: existingManifest.skills || [cDef.title, 'Problem Solving', 'Software Engineering'],
      outcomes: existingManifest.outcomes || [
        `Master fundamental to advanced concepts in ${cDef.title}.`,
        'Build industry-standard applications and capstone projects.',
        'Excel in technical interviews and competitive programming.'
      ],
      prerequisites: existingManifest.prerequisites || ['Basic computer literacy'],
      modulesCount: finalModules.length,
      lessonsCount: courseTopicsCount,
      estimatedHours: finalModules.reduce((acc, m) => acc + (m.estimatedHours || 3), 0),
      modules: manifestModules,
      updatedAt: new Date().toISOString()
    };

    fs.writeFileSync(manifestPath, JSON.stringify(updatedManifest, null, 2), 'utf8');
    totalCoursesProcessed++;
    totalTopicsDeduplicated += courseTopicsCount;

    console.log(`✅ [${cDef.domainId}/${cDef.folder}] Reorganized into ${finalModules.length} canonical modules (${courseTopicsCount} deduplicated topics).`);
  }

  // 6. Synchronize domains.json with new module & topic counts
  console.log('\n📄 Synchronizing domains.json...');
  const domainsManifestPath = path.join(CATALOG_DIR, 'domains.json');
  const domainsManifest = loadJson(domainsManifestPath);

  if (domainsManifest && domainsManifest.domains) {
    for (const domain of domainsManifest.domains) {
      if (!domain.courses) continue;
      for (const cStub of domain.courses) {
        const manifestPath = path.join(CATALOG_DIR, domain.id, cStub.folder || cStub.slug || cStub.id, 'course.json');
        const cManifest = loadJson(manifestPath);
        if (cManifest) {
          cStub.modulesCount = cManifest.modulesCount || cManifest.modules?.length || 3;
          cStub.lessonsCount = cManifest.lessonsCount || 8;
          cStub.estimatedHours = cManifest.estimatedHours || 35;
          cStub.rating = cManifest.rating || 4.9;
          cStub.enabled = true;
        }
      }
    }
    fs.writeFileSync(domainsManifestPath, JSON.stringify(domainsManifest, null, 2), 'utf8');
    console.log(`✅ Updated master domains manifest: ${domainsManifestPath}`);
  }

  console.log('\n=============================================');
  console.log(`🎉 REORGANIZATION COMPLETE!`);
  console.log(`  - Courses Processed:       ${totalCoursesProcessed}`);
  console.log(`  - Canonical Modules Built: ${totalModulesGenerated}`);
  console.log(`  - Total Unified Topics:    ${totalTopicsDeduplicated}`);
  console.log('=============================================\n');
}

reorganizeAllCourses().catch(err => {
  console.error('Fatal error during reorganization:', err);
  process.exit(1);
});
