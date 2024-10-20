const express = require('express');
const ejs = require('ejs');
const mysql = require('mysql');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const bodyParser = require('body-parser');


// Create a connection
const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'homeloan'
});

//app initialize
const app = express();


// app default options
app.use(session({
    secret: 'secret',
    resave: true,
    saveUninitialized: true
}));

// Middleware to prevent caching
app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
});

// Middleware
app.use(session({
    secret: 'secret',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Set to true in production with HTTPS
}));




// Connect to the database
connection.connect(err => {
    if (err) {
        console.error('Database connection failed:', err.stack);
        return;
    }
    console.log('Connected to database.');
});

//app.use
app.use(express.json());
app.use(express.urlencoded({ extended: true}));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));
app.set('view engine', 'ejs');


// Authentication middleware
function isAuthenticated(req, res, next) {
    if (req.session.user) {
        return next(); // User is authenticated
    }
    res.redirect('/login'); // Redirect to login if not authenticated
}

//app pages links

//index
app.get('/index', function (request, res){
    res.render('pages/index')
});

// Register route
app.get('/register', (req, res) => {
    res.render('pages/register');
});

// Registration route
app.post('/register', async (req, res) => {
    const { username, password } = req.body;

    try {
        // Hash the password
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // SQL query to insert the new user into the register table
        const query = 'INSERT INTO register (username, password) VALUES (?, ?)';
        
        connection.query(query, [username, hashedPassword], (err, results) => {
            if (err) {
                console.error('Error inserting data:', err);
                return res.status(500).send('Error saving user.');
            }
            console.log('User registered successfully:', results);
            res.redirect('/login'); // Redirect to the login page
        });
    } catch (error) {
        console.error('Error hashing password:', error);
        res.status(500).send('Error processing request.');
    }
});


// Login route
app.get('/login', (req, res) => {
    res.render('pages/login');
});


// Login route
app.post('/login', (req, res) => {
    const { username, password } = req.body;

    // Query to find the user by username
    const query = 'SELECT * FROM register WHERE username = ?';
    connection.query(query, [username], async (err, results) => {
        if (err) {
            console.error('Error during login:', err.message);
            return res.status(500).send('Internal server error.');
        }

        // Check if a user was found
        if (results.length > 0) {
            const user = results[0];

            // Compare the hashed password with the provided password
            if (await bcrypt.compare(password, user.password)) {
                req.session.user = user; // Store user info in session
                return res.redirect('/dashboard'); // Redirect to dashboard
            } else {
                console.log('Password mismatch for user:', username);
            }
        } else {
            console.log('User not found:', username);
        }

        // If user not found or password doesn't match, redirect to login
        res.redirect('/login');
    });
});


// Dashboard route
app.get('/dashboard', isAuthenticated, (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }

    const username = req.session.user.username;

    // Query to get user details from the database
    const query = 'SELECT * FROM register WHERE username = ?';
    connection.query(query, [username], (err, results) => {
        if (err) {
            console.error('Error retrieving user data:', err.message);
            return res.status(500).send('Internal server error.');
        }

        if (results.length > 0) {
            const user = results[0]; // Get the user object
            res.render('pages/dashboard', { user }); // Render the dashboard with user info
        } else {
            // If no user is found, redirect to login
            res.redirect('/login');
        }
    });
});


// Handle home loan submission
app.post('/submit-loan', isAuthenticated, (req, res) => {
    console.log("Received loan application:", req.body);
    const { fullName, email, phone, income, loanAmount, loanTerm, propertyValue, downPayment} = req.body;

    // Convert string inputs to numbers for calculations
    const annualIncome = parseFloat(income);
    const requestedLoanAmount = parseFloat(loanAmount);
    const propertyVal = parseFloat(propertyValue);
    const downPaymentAmount = parseFloat(downPayment);

    // Conditions for approval
    const minIncome = 30000; // Minimum annual income
    const maxLoanPercentage = 0.8; // Max loan amount as a percentage of property value
    const minDownPaymentPercentage = 0.1; // Minimum down payment as a percentage of property value

    let approvalStatus = "";

    // Check conditions
    if (annualIncome < minIncome) {
        approvalStatus = "Declined: Annual income is below the minimum requirement.";
    } else if (requestedLoanAmount > propertyVal * maxLoanPercentage) {
        approvalStatus = "Declined: Loan amount exceeds 80% of property value.";
    } else if (downPaymentAmount < propertyVal * minDownPaymentPercentage) {
        approvalStatus = "Declined: Down payment is less than 10% of property value.";
    } else {
        approvalStatus = "Approved: Your loan application is approved!";
        
        // Insert data into the database
        const query = 'INSERT INTO loan (fullName, email, phone, income, loanAmount, loanTerm, propertyValue, downPayment, approvalStatus, username) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
    connection.query(query, [fullName, email, phone, annualIncome, requestedLoanAmount, loanTerm, propertyVal, downPaymentAmount, approvalStatus, req.session.user.username], (err, results) => {
            if (err) {
                console.error('Error inserting data:', err);
                return res.status(500).send('Error saving application.');
            }
            console.log('Data inserted successfully:', results);
            return res.send(approvalStatus); // Send response after successful insertion
        });
        return; // Prevent sending a response before the DB operation is complete
    }

    // Send response for declined applications
    res.send(approvalStatus);
});


// Logout route
app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.redirect('/dashboard');
        }
        res.redirect('/login');
    });
});

//admin records
app.get('/adminRecords', isAuthenticated, (req, res) => { 
    if (!req.session.user) {
        return res.redirect('/Admin'); // Redirect to login if not authenticated
    }

    const query = 'SELECT * FROM loan WHERE username = ?'; // Query to get loan applications for logged-in admin
    connection.query(query, [req.session.user.username], (err, results) => {
        if (err) {
            console.error('Error retrieving data:', err);
            return res.status(500).send('Error retrieving loan applications.');
        }
        // Check if results are empty
        if (!results || results.length === 0) {
            return res.render('pages/adminRecords', { applications: [] }); // Pass empty array if no applications
        }
        // Render the admin view and pass the loan applications to it
        res.render('pages/adminRecords', { applications: results });
    });
});




//app listen
app.listen(3000);