import fs from 'fs';
import path from 'path';

// Helper to convert SQLBolt HTML to clean Markdown
function htmlToMarkdown(html) {
  if (!html) return '';
  let md = html;

  // Replace definition boxes
  md = md.replace(/<div class="definition">[\s\S]*?<div class="desc">([\s\S]*?)<\/div>[\s\S]*?<code class="sql">([\s\S]*?)<\/code>[\s\S]*?<\/div>/gi, (_, desc, code) => {
    return `\n> **${desc.trim()}**\n\`\`\`sql\n${code.replace(/&hellip;/g, '...').replace(/&gt;/g, '>').replace(/&lt;/g, '<').trim()}\n\`\`\`\n`;
  });

  // Replace code tags
  md = md.replace(/<code>(.*?)<\/code>/gi, '`$1`');

  // Replace h1, h2, h3
  md = md.replace(/<h1>(.*?)<\/h1>/gi, '\n### $1\n');
  md = md.replace(/<h2>(.*?)<\/h2>/gi, '\n#### $1\n');

  // Replace bold and italics
  md = md.replace(/<(strong|b)>(.*?)<\/(strong|b)>/gi, '**$2**');
  md = md.replace(/<(em|i)>(.*?)<\/(em|i)>/gi, '*$2*');

  // Replace paragraphs
  md = md.replace(/<p>(.*?)<\/p>/gi, '\n$1\n');

  // Strip remaining HTML tags
  md = md.replace(/<[^>]+>/g, '');

  // Fix entities
  md = md.replace(/&hellip;/g, '...')
         .replace(/&amp;/g, '&')
         .replace(/&lt;/g, '<')
         .replace(/&gt;/g, '>')
         .replace(/&quot;/g, '"')
         .replace(/&#39;/g, "'")
         .replace(/&ndash;/g, '–');

  // Collapse consecutive newlines
  md = md.replace(/\n{3,}/g, '\n\n').trim();

  return md;
}

// Generate table SQL from extracted tables
function getTableSql(tableName, extractedTables) {
  let tableData = null;
  if (extractedTables.pixar[tableName]) {
    tableData = extractedTables.pixar[tableName];
  } else if (extractedTables.misc[tableName]) {
    tableData = extractedTables.misc[tableName];
  }

  if (!tableData) {
    return { schemaSql: '', seedSql: '' };
  }

  const schemaSql = tableData.schemaSql;
  const cols = tableData.columns;
  const rowStrings = tableData.rows.map(r => {
    const vals = r.map(v => {
      if (v === null) return 'NULL';
      if (typeof v === 'string') return `'${v.replace(/'/g, "''")}'`;
      return v;
    });
    return `(${vals.join(', ')})`;
  });

  const seedSql = rowStrings.length > 0 
    ? `INSERT INTO ${tableName} (${cols.join(', ')}) VALUES\n${rowStrings.join(',\n')};\n`
    : '';

  return { schemaSql, seedSql };
}

async function buildCourse() {
  console.log('Loading extracted data...');
  const extractedTables = JSON.parse(fs.readFileSync('src/courses/scripts/extractedTables.json', 'utf8'));
  const extractedQuizzes = JSON.parse(fs.readFileSync('src/courses/scripts/extractedQuizzes.json', 'utf8'));

  const lessonsMetadata = [
    // MODULE 1
    {
      moduleId: 'sql-m1',
      moduleTitle: 'Module 1: Querying Data with SELECT',
      moduleDescription: 'Learn how to inspect, retrieve, and filter data from relational tables using SELECT, WHERE, LIKE, ORDER BY, and LIMIT.',
      topicId: 'sql-m1-t1',
      slug: 'select_queries_introduction',
      table: 'movies',
      readingTime: 12
    },
    {
      moduleId: 'sql-m1',
      topicId: 'sql-m1-t2',
      slug: 'select_queries_with_constraints',
      table: 'movies',
      readingTime: 15
    },
    {
      moduleId: 'sql-m1',
      topicId: 'sql-m1-t3',
      slug: 'select_queries_with_constraints_pt_2',
      table: 'movies',
      readingTime: 15
    },
    {
      moduleId: 'sql-m1',
      topicId: 'sql-m1-t4',
      slug: 'filtering_sorting_query_results',
      table: 'movies',
      readingTime: 15
    },
    {
      moduleId: 'sql-m1',
      topicId: 'sql-m1-t5',
      slug: 'select_queries_review',
      table: 'north_american_cities',
      readingTime: 20
    },

    // MODULE 2
    {
      moduleId: 'sql-m2',
      moduleTitle: 'Module 2: Multi-Table Queries & Relational JOINs',
      moduleDescription: 'Master relational data modeling with INNER JOIN, LEFT/RIGHT OUTER JOINs, and handling missing NULL values.',
      topicId: 'sql-m2-t1',
      slug: 'select_queries_with_joins',
      table: 'movies',
      extraTable: 'boxoffice',
      readingTime: 18
    },
    {
      moduleId: 'sql-m2',
      topicId: 'sql-m2-t2',
      slug: 'select_queries_with_outer_joins',
      table: 'employees',
      extraTable: 'buildings',
      readingTime: 18
    },
    {
      moduleId: 'sql-m2',
      topicId: 'sql-m2-t3',
      slug: 'select_queries_with_nulls',
      table: 'employees',
      extraTable: 'buildings',
      readingTime: 15
    },

    // MODULE 3
    {
      moduleId: 'sql-m3',
      moduleTitle: 'Module 3: Aggregates, Expressions & Execution Order',
      moduleDescription: 'Calculate metrics, perform column expressions, group data with GROUP BY/HAVING, and understand the SQL pipeline.',
      topicId: 'sql-m3-t1',
      slug: 'select_queries_with_expressions',
      table: 'movies',
      extraTable: 'boxoffice',
      readingTime: 15
    },
    {
      moduleId: 'sql-m3',
      topicId: 'sql-m3-t2',
      slug: 'select_queries_with_aggregates',
      table: 'employees',
      readingTime: 18
    },
    {
      moduleId: 'sql-m3',
      topicId: 'sql-m3-t3',
      slug: 'select_queries_with_aggregates_pt_2',
      table: 'employees',
      readingTime: 18
    },
    {
      moduleId: 'sql-m3',
      topicId: 'sql-m3-t4',
      slug: 'select_queries_order_of_execution',
      table: 'movies',
      extraTable: 'boxoffice',
      readingTime: 15
    },

    // MODULE 4
    {
      moduleId: 'sql-m4',
      moduleTitle: 'Module 4: Database Mutations & Table Administration',
      moduleDescription: 'Create, modify, alter, and delete database records and table schemas using SQL DDL and DML statements.',
      topicId: 'sql-m4-t1',
      slug: 'inserting_rows',
      table: 'movies',
      readingTime: 15
    },
    {
      moduleId: 'sql-m4',
      topicId: 'sql-m4-t2',
      slug: 'updating_rows',
      table: 'movies',
      readingTime: 15
    },
    {
      moduleId: 'sql-m4',
      topicId: 'sql-m4-t3',
      slug: 'deleting_rows',
      table: 'movies',
      readingTime: 15
    },
    {
      moduleId: 'sql-m4',
      topicId: 'sql-m4-t4',
      slug: 'creating_tables',
      table: 'movies',
      readingTime: 20
    },
    {
      moduleId: 'sql-m4',
      topicId: 'sql-m4-t5',
      slug: 'altering_tables',
      table: 'movies',
      readingTime: 15
    },
    {
      moduleId: 'sql-m4',
      topicId: 'sql-m4-t6',
      slug: 'dropping_tables',
      table: 'movies',
      readingTime: 12
    },

    // MODULE 5
    {
      moduleId: 'sql-m5',
      moduleTitle: 'Module 5: Advanced SQL Patterns & Subqueries',
      moduleDescription: 'Deep dive into subqueries, nested SELECT statements, and advanced relational queries adapted from SQLZoo and SQLBolt.',
      topicId: 'sql-m5-t1',
      slug: 'subqueries_nested',
      customTopic: true,
      title: 'SQL Advanced: Subqueries & Nested SELECT',
      description: 'Use a query within another query to evaluate dynamic criteria and compute multi-level comparisons.',
      table: 'employees',
      readingTime: 20
    },
    {
      moduleId: 'sql-m5',
      topicId: 'sql-m5-t2',
      slug: 'self_joins_complex',
      customTopic: true,
      title: 'SQL Advanced: Self-Joins & Hierarchical Data',
      description: 'Join a table to itself to analyze peer-to-peer relationships, hierarchies, and multi-hop connections.',
      table: 'employees',
      readingTime: 20
    }
  ];

  console.log('Fetching and compiling all lessons...');
  const compiledTopics = {};

  for (const m of lessonsMetadata) {
    if (m.customTopic) {
      // Custom subquery topic
      const tableInfo = getTableSql(m.table, extractedTables);
      let lessonMarkdown = '';
      let tasks = [];
      let defaultQuery = '';

      if (m.slug === 'subqueries_nested') {
        lessonMarkdown = `### Subqueries & Nested SELECT Queries\n\nA subquery (or inner query) is a query nested inside a larger SQL statement (outer query). Subqueries can be placed in \`WHERE\`, \`FROM\`, or \`SELECT\` clauses.\n\n> **Basic Subquery in WHERE**\n\`\`\`sql\nSELECT name, years_employed FROM employees\nWHERE years_employed > (\n  SELECT AVG(years_employed) FROM employees\n);\n\`\`\`\n\n#### Why Use Subqueries?\n1. **Dynamic Thresholds**: Compare records against calculated metrics (like the average or maximum) without hardcoding values.\n2. **Filtering with IN / NOT IN**: Select records whose IDs exist in another table or filtered list.\n3. **Derived Tables**: Use a subquery in the \`FROM\` clause as a virtual table.\n\n### Exercise\nWrite queries using the \`employees\` table below to solve the subquery objectives.`;
        tasks = [
          {
            instruction: "Find the name and role of employees who have been employed for longer than the average years employed across all employees.",
            expectedQuery: "SELECT name, role FROM employees WHERE years_employed > (SELECT AVG(years_employed) FROM employees);",
            solution: "SELECT name, role FROM employees WHERE years_employed > (SELECT AVG(years_employed) FROM employees);"
          },
          {
            instruction: "Find the employees who work in the same building as Malcolm S. (using a subquery).",
            expectedQuery: "SELECT name, building FROM employees WHERE building = (SELECT building FROM employees WHERE name = 'Malcolm S.');",
            solution: "SELECT name, building FROM employees WHERE building = (SELECT building FROM employees WHERE name = 'Malcolm S.');"
          }
        ];
        defaultQuery = "-- Write a query using a subquery\nSELECT name, years_employed FROM employees;";
      } else {
        lessonMarkdown = `### Self-Joins in Relational Databases\n\nA self-join is a regular join, but the table is joined with itself. Self-joins are essential when rows within the same table reference each other (e.g. employees and their managers, or bus routes sharing a stop).\n\n> **Self-Join Syntax**\n\`\`\`sql\nSELECT A.name AS Employee, B.name AS Colleague\nFROM employees A\nJOIN employees B ON A.building = B.building AND A.name != B.name;\n\`\`\`\n\n#### Key Rules for Self-Joins:\n- You must use **table aliases** (\`A\`, \`B\`) to distinguish between the two copies of the same table.\n- Ensure you avoid matching rows to themselves by adding conditions like \`A.name != B.name\` or \`A.id < B.id\`.\n\n### Exercise\nExplore peer relationships in the \`employees\` dataset using self-joins.`;
        tasks = [
          {
            instruction: "Find all pairs of employees who work in the same building (show employee name and colleague name, avoiding duplicate reversed pairs).",
            expectedQuery: "SELECT A.name, B.name FROM employees A JOIN employees B ON A.building = B.building AND A.name < B.name;",
            solution: "SELECT A.name, B.name FROM employees A JOIN employees B ON A.building = B.building AND A.name < B.name;"
          },
          {
            instruction: "Find all pairs of employees who have the exact same role and years employed.",
            expectedQuery: "SELECT A.name, B.name, A.role FROM employees A JOIN employees B ON A.role = B.role AND A.years_employed = B.years_employed AND A.name < B.name;",
            solution: "SELECT A.name, B.name, A.role FROM employees A JOIN employees B ON A.role = B.role AND A.years_employed = B.years_employed AND A.name < B.name;"
          }
        ];
        defaultQuery = "-- Write a self-join query\nSELECT A.name, B.name FROM employees A JOIN employees B ON A.building = B.building;";
      }

      compiledTopics[m.topicId] = {
        topicId: m.topicId,
        title: m.title,
        description: m.description,
        mode: 'SQL_INTERACTIVE',
        readingTimeMinutes: m.readingTime,
        lessonMarkdown,
        lessonContent: {
          textAndVisuals: {
            content: lessonMarkdown
          }
        },
        sqlExercise: {
          schemaSql: tableInfo.schemaSql,
          seedSql: tableInfo.seedSql,
          defaultTable: m.table,
          defaultQuery,
          tasks
        }
      };
      continue;
    }

    // Fetch from SQLBolt
    const url = `https://sqlbolt.com/lesson/${m.slug}`;
    const res = await fetch(url);
    const html = await res.text();

    // Extract title
    const titleMatch = html.match(/<title>SQLBolt - Learn SQL - (.*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : m.slug;

    // Extract lesson body
    const lessonBodyMatch = html.match(/<div class="lesson">[\s\S]*?<div class="body">([\s\S]*?)<\/div>\s*<\/div>/i);
    const rawBody = lessonBodyMatch ? lessonBodyMatch[1] : '';
    const lessonMarkdown = htmlToMarkdown(rawBody);

    // Extract exerciseJson
    let exerciseTasks = [];
    const exMatch = html.match(/var exerciseJson\s*=\s*("[\s\S]*?");\s*\n/);
    if (exMatch) {
      try {
        const raw = eval(exMatch[1]);
        const exData = JSON.parse(raw);
        if (Array.isArray(exData.tasks)) {
          exerciseTasks = exData.tasks.map((t, idx) => ({
            instruction: (t.text || t.instruction || `Task ${idx + 1}`).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
            expectedQuery: (t.solution || '').trim(),
            solution: (t.solution || '').trim(),
            orderSensitive: Boolean(t.order_sensitive)
          }));
        }
      } catch (err) {
        console.warn('Error parsing exerciseJson for', m.slug, err.message);
      }
    }

    // Build database schema & seed
    let tableInfo = getTableSql(m.table, extractedTables);
    let fullSchema = tableInfo.schemaSql;
    let fullSeed = tableInfo.seedSql;

    if (m.extraTable) {
      const extraInfo = getTableSql(m.extraTable, extractedTables);
      fullSchema += '\n' + extraInfo.schemaSql;
      fullSeed += '\n' + extraInfo.seedSql;
    }

    // Determine neutral default query
    let defaultQuery = `-- Write your SQL statement below to solve the exercise tasks:\nSELECT * FROM ${m.table} LIMIT 10;`;
    if (m.slug.includes('inserting_rows')) {
      defaultQuery = `-- Write your INSERT INTO statement here\n`;
    } else if (m.slug.includes('updating_rows')) {
      defaultQuery = `-- Write your UPDATE statement here\n`;
    } else if (m.slug.includes('deleting_rows')) {
      defaultQuery = `-- Write your DELETE statement here\n`;
    } else if (m.slug.includes('creating_tables')) {
      defaultQuery = `-- Write your CREATE TABLE statement here\n`;
    } else if (m.slug.includes('altering_tables')) {
      defaultQuery = `-- Write your ALTER TABLE statement here\n`;
    } else if (m.slug.includes('dropping_tables')) {
      defaultQuery = `-- Write your DROP TABLE statement here\n`;
    }

    compiledTopics[m.topicId] = {
      topicId: m.topicId,
      title,
      description: `Hands-on SQL exercise: ${title}. Learn syntax, inspect live SQLite tables, and validate queries in real-time.`,
      mode: 'SQL_INTERACTIVE',
      readingTimeMinutes: m.readingTime,
      lessonMarkdown,
      lessonContent: {
        textAndVisuals: {
          content: lessonMarkdown
        }
      },
      sqlExercise: {
        schemaSql: fullSchema,
        seedSql: fullSeed,
        defaultTable: m.table,
        defaultQuery,
        tasks: exerciseTasks
      }
    };

    console.log(`✓ Compiled ${m.topicId} (${title}) - ${exerciseTasks.length} tasks`);
  }

  // Organize into 5 modules with MSAs from SQLZoo
  const modules = [
    {
      moduleId: 'sql-m1',
      title: 'Module 1: Querying Data with SELECT',
      description: 'Master the fundamental SQL SELECT query syntax, numerical and text filtering with WHERE/LIKE, sorting with ORDER BY, and pagination with LIMIT & OFFSET.',
      estimatedMinutes: 90,
      topics: [
        compiledTopics['sql-m1-t1'],
        compiledTopics['sql-m1-t2'],
        compiledTopics['sql-m1-t3'],
        compiledTopics['sql-m1-t4'],
        compiledTopics['sql-m1-t5']
      ],
      msa: {
        title: 'Module 1 Assessment: SELECT Queries & Filtering Mastery (SQLZoo)',
        passPercent: 85,
        durationMinutes: 20,
        mcqSection: {
          sectionTitle: 'Section 1: SQLZoo SELECT Basics & Filtering MCQs',
          durationMinutes: 20,
          passCutoffPercent: 85,
          questions: [
            ...(extractedQuizzes.find(q => q.slug === 'SELECT_Quiz')?.questions || []),
            {
              questionId: 'm1-msa-q5',
              prompt: 'Which clause is used to eliminate duplicate values from the output of a SELECT query?',
              options: ['UNIQUE', 'DISTINCT', 'FILTER', 'GROUP'],
              correctOptionIndex: 1,
              explanation: 'The DISTINCT keyword ensures that only unique rows are returned.'
            },
            {
              questionId: 'm1-msa-q6',
              prompt: 'In SQL, what is the effect of writing `LIMIT 5 OFFSET 10`?',
              options: [
                'Returns 10 rows starting from row 5',
                'Returns 5 rows after skipping the first 10 rows',
                'Returns rows between 5 and 10',
                'Limits the query duration to 5 seconds with 10 retries'
              ],
              correctOptionIndex: 1,
              explanation: 'OFFSET skips the specified number of rows, and LIMIT restricts the count returned.'
            }
          ]
        }
      }
    },
    {
      moduleId: 'sql-m2',
      title: 'Module 2: Multi-Table Queries & Relational JOINs',
      description: 'Connect relational tables with INNER JOIN, LEFT/RIGHT OUTER JOINs, and handle missing values with IS NULL / IS NOT NULL.',
      estimatedMinutes: 80,
      topics: [
        compiledTopics['sql-m2-t1'],
        compiledTopics['sql-m2-t2'],
        compiledTopics['sql-m2-t3']
      ],
      msa: {
        title: 'Module 2 Assessment: Relational JOINs & NULL Handling (SQLZoo)',
        passPercent: 85,
        durationMinutes: 25,
        mcqSection: {
          sectionTitle: 'Section 1: SQLZoo JOINs & NULL Handling MCQs',
          durationMinutes: 25,
          passCutoffPercent: 85,
          questions: [
            ...(extractedQuizzes.find(q => q.slug === 'JOIN_Quiz')?.questions || []),
            ...(extractedQuizzes.find(q => q.slug === 'Using_Null_Quiz')?.questions || [])
          ]
        }
      }
    },
    {
      moduleId: 'sql-m3',
      title: 'Module 3: Aggregates, Expressions & Execution Order',
      description: 'Compute statistical aggregates (COUNT, SUM, AVG, MIN, MAX), group records with GROUP BY and HAVING, and master the SQL query execution lifecycle.',
      estimatedMinutes: 90,
      topics: [
        compiledTopics['sql-m3-t1'],
        compiledTopics['sql-m3-t2'],
        compiledTopics['sql-m3-t3'],
        compiledTopics['sql-m3-t4']
      ],
      msa: {
        title: 'Module 3 Assessment: Aggregation, GROUP BY & Execution Order (SQLZoo)',
        passPercent: 85,
        durationMinutes: 20,
        mcqSection: {
          sectionTitle: 'Section 1: SQLZoo SUM, COUNT & Grouping MCQs',
          durationMinutes: 20,
          passCutoffPercent: 85,
          questions: [
            ...(extractedQuizzes.find(q => q.slug === 'SUM_and_COUNT_Quiz')?.questions || []),
            {
              questionId: 'm3-msa-q7',
              prompt: 'What is the fundamental difference between the WHERE clause and the HAVING clause in SQL?',
              options: [
                'WHERE filters individual rows before grouping; HAVING filters aggregated groups after grouping.',
                'WHERE works only with numbers, while HAVING works with strings.',
                'WHERE is optional, but HAVING is mandatory in all queries.',
                'There is no difference; they are aliases for each other.'
              ],
              correctOptionIndex: 0,
              explanation: 'WHERE filters records prior to GROUP BY aggregation; HAVING filters the aggregated summary groups.'
            },
            {
              questionId: 'm3-msa-q8',
              prompt: 'In what logical order does a relational SQL query execute?',
              options: [
                'SELECT -> FROM -> WHERE -> GROUP BY -> ORDER BY',
                'FROM -> WHERE -> GROUP BY -> HAVING -> SELECT -> DISTINCT -> ORDER BY -> LIMIT',
                'WHERE -> SELECT -> FROM -> ORDER BY -> LIMIT',
                'LIMIT -> ORDER BY -> SELECT -> FROM -> WHERE'
              ],
              correctOptionIndex: 1,
              explanation: 'The database first determines the tables (FROM), applies row filters (WHERE), aggregates (GROUP BY/HAVING), computes selected columns (SELECT/DISTINCT), and finally sorts and paginates (ORDER BY/LIMIT).'
            }
          ]
        }
      }
    },
    {
      moduleId: 'sql-m4',
      title: 'Module 4: Database Mutations & Table Administration',
      description: 'Master DDL and DML commands: inserting new records, safely modifying data with UPDATE/DELETE, and structuring tables with CREATE, ALTER, and DROP.',
      estimatedMinutes: 90,
      topics: [
        compiledTopics['sql-m4-t1'],
        compiledTopics['sql-m4-t2'],
        compiledTopics['sql-m4-t3'],
        compiledTopics['sql-m4-t4'],
        compiledTopics['sql-m4-t5'],
        compiledTopics['sql-m4-t6']
      ],
      msa: {
        title: 'Module 4 Assessment: DDL & DML Schema Administration',
        passPercent: 85,
        durationMinutes: 20,
        mcqSection: {
          sectionTitle: 'Section 1: Database Mutations & Table Schema MCQs',
          durationMinutes: 20,
          passCutoffPercent: 85,
          questions: [
            {
              questionId: 'm4-msa-q1',
              prompt: 'What happens if you execute an UPDATE statement without a WHERE clause?',
              options: [
                'The query will throw a syntax error.',
                'Every single row in the table will be modified with the new values.',
                'Only the first row in the table will be updated.',
                'The table schema will be dropped.'
              ],
              correctOptionIndex: 1,
              explanation: 'Without a WHERE constraint, UPDATE modifies all records across the entire table.'
            },
            {
              questionId: 'm4-msa-q2',
              prompt: 'Which SQL command is used to add a new column named status to an existing students table?',
              options: [
                'INSERT INTO students COLUMN status VARCHAR(20);',
                'ALTER TABLE students ADD COLUMN status VARCHAR(20);',
                'MODIFY TABLE students ADD status VARCHAR(20);',
                'UPDATE students CREATE COLUMN status VARCHAR(20);'
              ],
              correctOptionIndex: 1,
              explanation: 'ALTER TABLE ... ADD COLUMN is the standard DDL command to append new attributes.'
            },
            {
              questionId: 'm4-msa-q3',
              prompt: 'What is the primary difference between DELETE FROM table; and DROP TABLE table;?',
              options: [
                'DELETE removes all rows but retains the table structure; DROP deletes both the data and the table structure.',
                'DELETE drops the schema, while DROP only deletes rows.',
                'DELETE cannot be used in SQLite.',
                'There is no difference.'
              ],
              correctOptionIndex: 0,
              explanation: 'DELETE is DML operating on table content; DROP is DDL destroying the table definition entirely.'
            },
            {
              questionId: 'm4-msa-q4',
              prompt: 'Which keyword in a CREATE TABLE statement prevents two rows from having the same value in a specific column and enforces fast indexed lookups?',
              options: ['CHECK', 'PRIMARY KEY', 'CASCADE', 'FOREIGN KEY'],
              correctOptionIndex: 1,
              explanation: 'A PRIMARY KEY uniquely identifies each record in a relational database table and enforces uniqueness.'
            }
          ]
        }
      }
    },
    {
      moduleId: 'sql-m5',
      title: 'Module 5: Advanced SQL Patterns & Subqueries',
      description: 'Explore sophisticated subqueries, correlated queries, nested SELECT evaluations, and self-joins from SQLZoo.',
      estimatedMinutes: 75,
      topics: [
        compiledTopics['sql-m5-t1'],
        compiledTopics['sql-m5-t2']
      ],
      msa: {
        title: 'Module 5 Assessment: Subqueries & Advanced SQL Patterns (SQLZoo)',
        passPercent: 85,
        durationMinutes: 25,
        mcqSection: {
          sectionTitle: 'Section 1: SQLZoo Nested Subqueries & Self-Joins MCQs',
          durationMinutes: 25,
          passCutoffPercent: 85,
          questions: [
            ...(extractedQuizzes.find(q => q.slug === 'Nested_SELECT_Quiz')?.questions || []),
            ...(extractedQuizzes.find(q => q.slug === 'Self_join_Quiz')?.questions || [])
          ]
        }
      }
    }
  ];

  const fullCourse = {
    courseId: 'sql-interactive',
    title: 'Interactive SQL Mastery',
    slug: 'sql-interactive',
    category: 'Database Systems',
    level: 'Beginner to Advanced',
    rating: 4.96,
    reviewsCount: 4120,
    isPopular: true,
    badgeText: 'Hands-On Interactive • SQLBolt & SQLZoo Edition',
    description: 'Master SQL from basics to advanced relational modeling with 18 authentic lessons from SQLBolt and milestone assessments from SQLZoo. Features a high-speed SQLite WebAssembly engine, live dataset inspection, auto-evaluated tasks, and realistic schema mutations.',
    thumbnail: '/images/courses/sql_thumbnail.png',
    skills: [
      'SELECT Queries & Filtering',
      'Relational INNER & OUTER JOINs',
      'Aggregation, GROUP BY & HAVING',
      'Query Execution Pipeline',
      'Database Schema Mutations (INSERT, UPDATE, DELETE, CREATE, ALTER, DROP)',
      'Subqueries & Self-Joins'
    ],
    estimatedHours: 16,
    modules
  };

  const outputPath = 'src/courses/data/realCourses/sql-interactive.json';
  fs.writeFileSync(outputPath, JSON.stringify(fullCourse, null, 2));

  // Also sync to seed-website if directory exists
  const websitePath = '../seed-website/src/courses/data/realCourses/sql-interactive.json';
  if (fs.existsSync(path.dirname(websitePath))) {
    fs.writeFileSync(websitePath, JSON.stringify(fullCourse, null, 2));
    console.log('✓ Synced to seed-website/src/courses/data/realCourses/sql-interactive.json');
  }

  console.log(`\n🎉 Successfully written complete course to ${outputPath}!`);
  console.log(`Total Modules: ${modules.length}`);
  console.log(`Total Topics: ${modules.reduce((s, m) => s + m.topics.length, 0)}`);
  console.log(`Total MSAs: ${modules.filter(m => m.msa).length}`);
}

buildCourse();
