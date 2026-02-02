// server.js
const express = require('express');
const mysql = require('mysql2');
const WebSocket = require('ws');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path'); // ADD THIS LINE

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key_here';

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files (HTML, CSS, JS)
app.use(express.static(path.join(__dirname)));

// MySQL Database Connection - Railway
// MySQL Database Connection - Railway FIXED
// Simple database connection for Railway
const db = mysql.createConnection({
    uri: 'mysql://root:qbSRMsQerOciGUsIucYXMneBxuYAbBqe@crossover.proxy.rlwy.net:20883/railway',
    ssl: { rejectUnauthorized: false }
});

db.connect((err) => {
    if (err) {
        console.error('Database connection error:', err);
        // Keep trying
        setTimeout(() => db.connect(), 3000);
    } else {
        console.log('✅ Database connected!');
        initializeDatabase();
    }
});// MySQL Database Connection with auto-reconnect
let db;

function createConnection() {
    console.log('Creating database connection...');
    
    db = mysql.createConnection({
        uri: 'mysql://root:qbSRMsQerOciGUsIucYXMneBxuYAbBqe@crossover.proxy.rlwy.net:20883/railway',
        ssl: { rejectUnauthorized: false },
        connectTimeout: 10000,
        multipleStatements: true
    });
    
    db.connect((err) => {
        if (err) {
            console.error('❌ Database connection failed:', err.message);
            console.log('Retrying in 5 seconds...');
            
            // Auto-retry after 5 seconds
            setTimeout(createConnection, 5000);
        } else {
            console.log('✅ Database connected successfully!');
            
            // Setup auto-reconnect on error
            db.on('error', (err) => {
                console.error('Database error:', err);
                
                if (err.code === 'PROTOCOL_CONNECTION_LOST') {
                    console.log('Connection lost, reconnecting...');
                    createConnection();
                }
            });
            
            // Initialize tables
            initializeDatabase();
            
            // Start keep-alive interval
            startKeepAlive();
        }
    });
}

// Start keep-alive ping every 4 minutes
function startKeepAlive() {
    setInterval(() => {
        if (db && db.state !== 'disconnected') {
            db.query('SELECT 1', (err) => {
                if (err) {
                    console.log('Keep-alive ping failed, reconnecting...');
                    createConnection();
                } else {
                    console.log('Keep-alive ping successful at', new Date().toISOString());
                }
            });
        }
    }, 4 * 60 * 1000); // Every 4 minutes
}

// Initialize connection
createConnection();


// Serve main.html at root
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'main.html'));
});
// Middleware to verify JWT token
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }
    
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid or expired token' });
        }
        req.user = user;
        next();
    });
}

// Initialize database tables function
function initializeDatabase() {
    // Create employees table
    db.query(`
        CREATE TABLE IF NOT EXISTS employees (
            id INT PRIMARY KEY AUTO_INCREMENT,
            name VARCHAR(100) NOT NULL,
            email VARCHAR(100) UNIQUE NOT NULL,
            password VARCHAR(255) NOT NULL,
            position VARCHAR(100),
            department VARCHAR(100),
            is_admin BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `, (err) => {
        if (err) {
            console.error('Error creating employees table:', err);
        } else {
            console.log('Employees table ready');
        }
    });
    
    // Create projects table
    db.query(`
        CREATE TABLE IF NOT EXISTS projects (
            id INT PRIMARY KEY AUTO_INCREMENT,
            name VARCHAR(100) NOT NULL,
            description TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `, (err) => {
        if (err) {
            console.error('Error creating projects table:', err);
        } else {
            console.log('Projects table ready');
        }
    });
    
    // Create tasks table
    db.query(`
        CREATE TABLE IF NOT EXISTS tasks (
            id INT PRIMARY KEY AUTO_INCREMENT,
            title VARCHAR(200) NOT NULL,
            description TEXT,
            project_id INT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
        )
    `, (err) => {
        if (err) {
            console.error('Error creating tasks table:', err);
        } else {
            console.log('Tasks table ready');
        }
    });
    
    // Create notifications table
    db.query(`
        CREATE TABLE IF NOT EXISTS notifications (
            id INT PRIMARY KEY AUTO_INCREMENT,
            employee_id INT NOT NULL,
            title VARCHAR(200) NOT NULL,
            message TEXT NOT NULL,
            type VARCHAR(50) DEFAULT 'info',
            is_read BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
        )
    `, (err) => {
        if (err) {
            console.error('Error creating notifications table:', err);
        } else {
            console.log('Notifications table ready');
        }
    });
    
    // Create employee_status table
    db.query(`
        CREATE TABLE IF NOT EXISTS employee_status (
            id INT PRIMARY KEY AUTO_INCREMENT,
            employee_id INT NOT NULL,
            status ENUM('active', 'inactive', 'busy') DEFAULT 'inactive',
            task_id INT,
            notes TEXT,
            start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            end_time TIMESTAMP NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
            FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL
        )
    `, (err) => {
        if (err) {
            console.error('Error creating employee_status table:', err);
        } else {
            console.log('Employee_status table ready');
        }
    });
    
    // Create activity_log table
    db.query(`
        CREATE TABLE IF NOT EXISTS activity_log (
            id INT PRIMARY KEY AUTO_INCREMENT,
            employee_id INT NOT NULL,
            action VARCHAR(100) NOT NULL,
            details TEXT,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
        )
    `, (err) => {
        if (err) {
            console.error('Error creating activity_log table:', err);
        } else {
            console.log('Activity_log table ready');
        }
    });
   function checkAndCreateDefaultUsers() {
    console.log('Checking default users...');
    
    db.query('SELECT * FROM employees WHERE email = "admin@office.com"', (err, results) => {
        if (err) {
            console.error('Error checking admin:', err);
            return;
        }
        
        if (results.length === 0) {
            const hashedPassword = bcrypt.hashSync('admin123', 10);
            db.query(
                'INSERT INTO employees (name, email, password, position, department, is_admin) VALUES (?, ?, ?, ?, ?, ?)',
                ['Admin User', 'admin@office.com', hashedPassword, 'Administrator', 'Management', 1],
                (err) => {
                    if (err) {
                        console.error('Error creating admin:', err);
                    } else {
                        console.log('✅ Default admin user created');
                    }
                }
            );
        } else {
            console.log('✅ Admin user already exists');
        }
    });
} 
    // Add some sample data for testing
    
}

// Function to add sample data
// Delete employee (admin only) - ADD THIS
app.delete('/api/employees/:id', authenticateToken, (req, res) => {
    if (!req.user.is_admin) {
        return res.status(403).json({ error: 'Admin access required' });
    }
    
    const employeeId = req.params.id;
    
    // Don't allow deleting yourself
    if (parseInt(employeeId) === req.user.id) {
        return res.status(400).json({ error: 'Cannot delete your own account' });
    }
    
    // First delete related records (due to foreign keys)
    const deleteQueries = [
        'DELETE FROM activity_log WHERE employee_id = ?',
        'DELETE FROM notifications WHERE employee_id = ?',
        'DELETE FROM employee_status WHERE employee_id = ?',
        'DELETE FROM employees WHERE id = ?'
    ];
    
    // Execute all delete queries
    const executeQuery = (index) => {
        if (index >= deleteQueries.length) {
            return res.json({ message: 'Employee deleted successfully' });
        }
        
        db.query(deleteQueries[index], [employeeId], (err) => {
            if (err) {
                console.error('Delete error:', err);
                return res.status(500).json({ error: 'Database error' });
            }
            executeQuery(index + 1);
        });
    };
    
    executeQuery(0);
});
// Routes
// Employee login
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    
    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
    }
    
    // Find employee by email
    db.query('SELECT * FROM employees WHERE email = ?', [email], (err, results) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        
        if (results.length === 0) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }
        
        const employee = results[0];
        
        // Compare passwords
        bcrypt.compare(password, employee.password, (err, isMatch) => {
            if (err || !isMatch) {
                return res.status(401).json({ error: 'Invalid email or password' });
            }
            
            // Create JWT token
            const token = jwt.sign(
                { id: employee.id, email: employee.email, is_admin: employee.is_admin },
                JWT_SECRET,
                { expiresIn: '24h' }
            );
            
            // Log activity
            db.query(
                'INSERT INTO activity_log (employee_id, action, details) VALUES (?, ?, ?)',
                [employee.id, 'login', 'User logged in'],
                (err) => {
                    if (err) console.error('Error logging activity:', err);
                }
            );
            
            res.json({
                token,
                employee: {
                    id: employee.id,
                    name: employee.name,
                    email: employee.email,
                    position: employee.position,
                    department: employee.department,
                    is_admin: employee.is_admin
                }
            });
        });
    });
});

// Get all employees (admin only)
app.get('/api/employees', authenticateToken, (req, res) => {
    if (!req.user.is_admin) {
        return res.status(403).json({ error: 'Admin access required' });
    }
    
    db.query(`
        SELECT 
            e.*, 
            es.status, 
            es.start_time, 
            es.end_time, 
            es.notes as task_notes,
            t.id as task_id,
            t.title as task_title,
            t.description as task_description,
            p.name as project_name
        FROM employees e
        LEFT JOIN employee_status es ON e.id = es.employee_id AND es.end_time IS NULL
        LEFT JOIN tasks t ON es.task_id = t.id
        LEFT JOIN projects p ON t.project_id = p.id
        ORDER BY e.name
    `, (err, results) => {
        if (err) {
            console.error('Database error in /api/employees:', err);
            return res.status(500).json({ 
                error: 'Database error',
                details: err.message
            });
        }
        res.json(results);
    });
});

// Get current employee status
app.get('/api/employee/status', authenticateToken, (req, res) => {
    const employeeId = req.user.id;
    
    db.query(`
        SELECT es.*, t.title as task_title, p.name as project_name
        FROM employee_status es
        LEFT JOIN tasks t ON es.task_id = t.id
        LEFT JOIN projects p ON t.project_id = p.id
        WHERE es.employee_id = ? AND es.end_time IS NULL
        ORDER BY es.created_at DESC
        LIMIT 1
    `, [employeeId], (err, results) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        
        if (results.length === 0) {
            return res.json({ status: 'inactive', task: null });
        }
        
        res.json(results[0]);
    });
});

// Update employee status
// Update employee status
app.post('/api/employee/status', authenticateToken, (req, res) => {
    const employeeId = req.user.id;
    const { status, task_id, notes } = req.body;
    
    // End any current status
    db.query(
        'UPDATE employee_status SET end_time = CURRENT_TIMESTAMP WHERE employee_id = ? AND end_time IS NULL',
        [employeeId],
        (err) => {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }
            
            // If status is not inactive, create a new status record
            if (status !== 'inactive') {
                db.query(
                    'INSERT INTO employee_status (employee_id, status, task_id, notes, start_time) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)',
                    [employeeId, status, task_id, notes],
                    (err, result) => {
                        if (err) {
                            return res.status(500).json({ error: 'Database error' });
                        }
                        
                        // Log activity
                        let action = 'status_update';
                        let details = `Status changed to ${status}`;
                        if (task_id) {
                            details += ` with task ${task_id}`;
                        }
                        
                        db.query(
                            'INSERT INTO activity_log (employee_id, action, details) VALUES (?, ?, ?)',
                            [employeeId, action, details],
                            (err) => {
                                if (err) console.error('Error logging activity:', err);
                            }
                        );
                        
                        // Get employee name for notification
                        db.query('SELECT name FROM employees WHERE id = ?', [employeeId], (err, results) => {
                            if (!err && results.length > 0) {
                                // Broadcast status update to admin
                                broadcastStatusUpdate({
                                    employee_id: employeeId,
                                    employee_name: results[0].name,
                                    status: status,
                                    task_id: task_id,
                                    notes: notes,
                                    timestamp: new Date().toISOString()
                                });
                            }
                        });
                        
                        res.json({ message: 'Status updated successfully' });
                    }
                );
            } else {
                // Log activity for going inactive
                db.query(
                    'INSERT INTO activity_log (employee_id, action, details) VALUES (?, ?, ?)',
                    [employeeId, 'status_update', 'Status changed to inactive'],
                    (err) => {
                        if (err) console.error('Error logging activity:', err);
                    }
                );
                
                // Get employee name for notification
                db.query('SELECT name FROM employees WHERE id = ?', [employeeId], (err, results) => {
                    if (!err && results.length > 0) {
                        // Broadcast status update to admin
                        broadcastStatusUpdate({
                            employee_id: employeeId,
                            employee_name: results[0].name,
                            status: 'inactive',
                            timestamp: new Date().toISOString()
                        });
                    }
                });
                
                res.json({ message: 'Status updated successfully' });
            }
        }
    );
});

// Function to broadcast status updates to admin
function broadcastStatusUpdate(statusUpdate) {
    connectedClients.forEach((ws, employeeId) => {
        // Only send to admin users (you need to track admin status)
        // For now, we'll send to all connected admin clients
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'status_update',  // Changed from 'notification'
                ...statusUpdate,
                timestamp: new Date().toISOString(),
                status_updated: true
            }));
        }
    });
}
// Add these routes BEFORE the WebSocket setup

// 1. Basic health check (for UptimeRobot)
app.get('/health', (req, res) => {
    res.json({ 
        status: 'UP',
        timestamp: new Date().toISOString(),
        service: 'Employee Dashboard API'
    });
});

// 2. Database health check
app.get('/api/health/db', (req, res) => {
    db.query('SELECT 1', (err) => {
        if (err) {
            console.error('Database health check failed:', err);
            return res.status(500).json({ 
                status: 'DOWN',
                message: 'Database connection failed',
                error: err.message,
                timestamp: new Date().toISOString()
            });
        }
        
        res.json({ 
            status: 'UP',
            message: 'Database connected successfully',
            timestamp: new Date().toISOString()
        });
    });
});

// 3. Full system health check
app.get('/api/health/full', (req, res) => {
    const healthStatus = {
        status: 'UP',
        timestamp: new Date().toISOString(),
        services: {
            api: 'UP',
            database: 'CHECKING',
            websocket: wss.clients.size
        },
        uptime: process.uptime(),
        memory: process.memoryUsage()
    };
    
    // Check database
    db.query('SELECT 1', (err) => {
        if (err) {
            healthStatus.services.database = 'DOWN';
            healthStatus.status = 'DEGRADED';
        } else {
            healthStatus.services.database = 'UP';
        }
        
        res.json(healthStatus);
    });
});

// 4. Keep-alive endpoint (for cron jobs)
app.get('/api/keepalive', (req, res) => {
    // Perform a simple query to keep connection alive
    db.query('SELECT NOW() as current_time', (err, results) => {
        if (err) {
            console.error('Keep-alive failed:', err);
            return res.status(500).json({ 
                status: 'error',
                message: 'Keep-alive failed',
                timestamp: new Date().toISOString()
            });
        }
        
        res.json({ 
            status: 'ok',
            message: 'Keep-alive successful',
            timestamp: results[0]?.current_time || new Date().toISOString()
        });
    });
});
// Get all tasks
app.get('/api/tasks', authenticateToken, (req, res) => {
    db.query(`
        SELECT t.*, p.name as project_name 
        FROM tasks t 
        LEFT JOIN projects p ON t.project_id = p.id
        ORDER BY t.title
    `, (err, results) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(results);
    });
});

// Get tasks with description
app.get('/api/tasks/with-description', authenticateToken, (req, res) => {
    if (!req.user.is_admin) {
        return res.status(403).json({ error: 'Admin access required' });
    }
    
    db.query(`
        SELECT t.*, p.name as project_name 
        FROM tasks t 
        LEFT JOIN projects p ON t.project_id = p.id
        ORDER BY t.title
    `, (err, results) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(results);
    });
});

// Get activity log for current employee
app.get('/api/employee/activity', authenticateToken, (req, res) => {
    const employeeId = req.user.id;
    
    db.query(
        'SELECT * FROM activity_log WHERE employee_id = ? ORDER BY timestamp DESC LIMIT 20',
        [employeeId],
        (err, results) => {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }
            res.json(results);
        }
    );
});

// Get dashboard statistics (admin only)
app.get('/api/dashboard/stats', authenticateToken, (req, res) => {
    if (!req.user.is_admin) {
        return res.status(403).json({ error: 'Admin access required' });
    }
    
    const stats = {};
    
    // Get total employees
    db.query('SELECT COUNT(*) as total FROM employees', (err, results) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        stats.totalEmployees = results[0].total;
        
        // Get active employees
        db.query('SELECT COUNT(DISTINCT employee_id) as active FROM employee_status WHERE end_time IS NULL AND status = "active"', (err, results) => {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }
            stats.activeEmployees = results[0].active;
            
            // Get busy employees
            db.query('SELECT COUNT(DISTINCT employee_id) as busy FROM employee_status WHERE end_time IS NULL AND status = "busy"', (err, results) => {
                if (err) {
                    return res.status(500).json({ error: 'Database error' });
                }
                stats.busyEmployees = results[0].busy;
                
                // Get inactive employees
                stats.inactiveEmployees = stats.totalEmployees - stats.activeEmployees - stats.busyEmployees;
                
                res.json(stats);
            });
        });
    });
});

// Assign task to employee (admin only)
app.post('/api/tasks/assign', authenticateToken, (req, res) => {
    if (!req.user.is_admin) {
        return res.status(403).json({ error: 'Admin access required' });
    }
    
    const { employee_id, task_id, notes } = req.body;
    
    if (!employee_id || !task_id) {
        return res.status(400).json({ error: 'Employee ID and Task ID are required' });
    }
    
    // Get task details for notification
    db.query('SELECT title, description FROM tasks WHERE id = ?', [task_id], (err, taskResults) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        
        if (taskResults.length === 0) {
            return res.status(404).json({ error: 'Task not found' });
        }
        
        const task = taskResults[0];
        
        // End any current status for the employee
        db.query(
            'UPDATE employee_status SET end_time = CURRENT_TIMESTAMP WHERE employee_id = ? AND end_time IS NULL',
            [employee_id],
            (err) => {
                if (err) {
                    return res.status(500).json({ error: 'Database error' });
                }
                
                // Create new status with assigned task
                db.query(
                    'INSERT INTO employee_status (employee_id, status, task_id, notes, start_time) VALUES (?, "busy", ?, ?, CURRENT_TIMESTAMP)',
                    [employee_id, task_id, notes || 'Task assigned by admin'],
                    (err, result) => {
                        if (err) {
                            return res.status(500).json({ error: 'Database error' });
                        }
                        
                        // Log activity
                        db.query(
                            'INSERT INTO activity_log (employee_id, action, details) VALUES (?, ?, ?)',
                            [employee_id, 'task_assigned', `Task "${task.title}" assigned by admin`],
                            (err) => {
                                if (err) console.error('Error logging activity:', err);
                            }
                        );
                        
                        // Send real-time notification to the employee
                        const notification = {
                            title: 'New Task Assigned',
                            message: `You have been assigned: "${task.title}"`,
                            taskId: task_id,
                            taskTitle: task.title,
                            assignedBy: req.user.name,
                            notes: notes || 'Task assigned by admin',
                            sound: 'notification'
                        };
                        
                        const notificationSent = sendNotificationToEmployee(employee_id, notification);
                        
                        // Also log notification in database
                        db.query(
                            'INSERT INTO notifications (employee_id, title, message, type, is_read, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
                            [employee_id, notification.title, notification.message, 'task_assigned', 0],
                            (err) => {
                                if (err) console.error('Error saving notification:', err);
                            }
                        );
                        
                        res.json({ 
                            message: 'Task assigned successfully',
                            notificationSent: notificationSent
                        });
                    }
                );
            }
        );
    });
});
// Add new employee (admin only) - ADD THIS CODE
app.post('/api/employees', authenticateToken, async (req, res) => {
    if (!req.user.is_admin) {
        return res.status(403).json({ error: 'Admin access required' });
    }
    
    const { name, email, password, position, department, is_admin } = req.body;
    
    if (!name || !email || !password) {
        return res.status(400).json({ error: 'Name, email and password are required' });
    }
    
    try {
        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Insert into database
        db.query(
            'INSERT INTO employees (name, email, password, position, department, is_admin) VALUES (?, ?, ?, ?, ?, ?)',
            [name, email, hashedPassword, position || '', department || '', is_admin || 0],
            (err, result) => {
                if (err) {
                    if (err.code === 'ER_DUP_ENTRY') {
                        return res.status(400).json({ error: 'Email already exists' });
                    }
                    return res.status(500).json({ error: 'Database error' });
                }
                
                res.json({ 
                    message: 'Employee added successfully',
                    employeeId: result.insertId 
                });
            }
        );
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});
// Get notifications for current employee
app.get('/api/notifications', authenticateToken, (req, res) => {
    const employeeId = req.user.id;
    
    db.query(
        'SELECT * FROM notifications WHERE employee_id = ? ORDER BY created_at DESC LIMIT 20',
        [employeeId],
        (err, results) => {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }
            res.json(results);
        }
    );
});

// Mark notification as read
app.post('/api/notifications/:id/read', authenticateToken, (req, res) => {
    const notificationId = req.params.id;
    const employeeId = req.user.id;
    
    db.query(
        'UPDATE notifications SET is_read = TRUE WHERE id = ? AND employee_id = ?',
        [notificationId, employeeId],
        (err, result) => {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }
            
            if (result.affectedRows === 0) {
                return res.status(404).json({ error: 'Notification not found' });
            }
            
            res.json({ message: 'Notification marked as read' });
        }
    );
});

// Mark all notifications as read
app.post('/api/notifications/read-all', authenticateToken, (req, res) => {
    const employeeId = req.user.id;
    
    db.query(
        'UPDATE notifications SET is_read = TRUE WHERE employee_id = ? AND is_read = FALSE',
        [employeeId],
        (err, result) => {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }
            
            res.json({ 
                message: 'All notifications marked as read',
                updatedCount: result.affectedRows
            });
        }
    );
});

// Store connected clients by employee ID
const connectedClients = new Map();

// Function to send notification to specific employee
function sendNotificationToEmployee(employeeId, notification) {
    const ws = connectedClients.get(employeeId);
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'notification',
            ...notification,
            timestamp: new Date().toISOString(),
            task_assigned: true  // Flag to indicate task assignment
        }));
        console.log(`Notification sent to employee ${employeeId}:`, notification);
        
        // Also notify admin about the task assignment
        notifyAdminAboutTaskAssignment(notification);
        return true;
    } else {
        console.log(`Employee ${employeeId} is not connected to WebSocket`);
        return false;
    }
}

// Notify admin when a task is assigned
function notifyAdminAboutTaskAssignment(notification) {
    connectedClients.forEach((ws, employeeId) => {
        // Check if this is an admin connection
        const adminConnections = Array.from(connectedClients.keys()).filter(id => {
            // You might want to check if the employee is admin from database
            // For now, we'll send to all connected clients
            return true;
        });
        
        adminConnections.forEach(adminId => {
            const adminWs = connectedClients.get(adminId);
            if (adminWs && adminWs.readyState === WebSocket.OPEN) {
                adminWs.send(JSON.stringify({
                    type: 'notification',
                    title: 'Task Assigned',
                    message: `Task "${notification.taskTitle}" assigned to employee`,
                    timestamp: new Date().toISOString(),
                    task_assigned: true
                }));
            }
        });
    });
}

// Function to broadcast to all connected clients (optional)
function broadcastToAll(notification) {
    connectedClients.forEach((ws, employeeId) => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'broadcast',
                ...notification,
                timestamp: new Date().toISOString()
            }));
        }
    });
}

// Create HTTP server
const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// Create WebSocket server
const wss = new WebSocket.Server({ server });
console.log('WebSocket server started');

// WebSocket connection handler
wss.on('connection', (ws, req) => {
    console.log('New WebSocket connection');
    
    // Parse token from URL query string
    const url = new URL(req.url, `http://${req.headers.host}`);
    const token = url.searchParams.get('token');
    
    if (!token) {
        ws.close(1008, 'No token provided');
        return;
    }
    
    // Verify JWT token
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            ws.close(1008, 'Invalid token');
            return;
        }
        
        // Store connection by employee ID
        connectedClients.set(user.id, ws);
        console.log(`Employee ${user.id} connected to WebSocket`);
        
        // Send welcome message
        ws.send(JSON.stringify({
            type: 'connected',
            message: 'WebSocket connected successfully'
        }));
        
        // Handle connection close
       ws.on('close', (code, reason) => {
    console.log(`Employee ${user.id} disconnected from WebSocket. Code: ${code}, Reason: ${reason}`);
    
    // Remove from connected clients if it's still this connection
    if (connectedClients.get(user.id) === ws) {
        connectedClients.delete(user.id);
    }
});
        
        // Handle errors
        ws.on('error', (error) => {
            console.error(`WebSocket error for employee ${user.id}:`, error);
        });
        
        // Handle incoming messages
        ws.on('message', (data) => {
            try {
                const message = JSON.parse(data);
                console.log('Received message from client:', message);
            } catch (error) {
                console.error('Error parsing WebSocket message:', error);
            }
        });
    });
});
