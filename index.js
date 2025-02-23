import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import dotenv from "dotenv";
import bcrypt from "bcrypt";
import passport from "passport";
import { Strategy } from "passport-local";
import session from "express-session";
import GoogleStrategy from "passport-google-oauth2";

const app = express();
const PORT = process.env.PORT || 3000;
const saltRounds = 10;
dotenv.config();


process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (err) => {
    console.error('Unhandled Rejection:', err);
});

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000 
    }
}));

app.use(passport.initialize());
app.use(passport.session());


let db = null;
const getDB = async () => {
    if (!db) {
        try {
            const isProduction = process.env.NODE_ENV === 'production';
            
            const dbConfig = isProduction ? {
                connectionString: process.env.DATABASE_URL,
                ssl: {
                    rejectUnauthorized: true
                }
            } : {
                user: process.env.PGUSER,
                host: process.env.PGHOST,
                database: process.env.PGDATABASE,
                password: process.env.PGPASSWORD,
                port: process.env.PGPORT,
            };

            db = new pg.Client(dbConfig);
            await db.connect();
            console.log('Environment:', process.env.NODE_ENV);
            console.log('Database Config:', isProduction ? 'Using production config' : 'Using development config');
            
            const result = await db.query('SELECT current_user, current_database()');
            console.log('Connected as:', result.rows[0]);
        } catch (error) {
            console.error('Database connection error:', error);
            throw error;
        }
    }
    return db;
};

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// Routes
app.get("/", async (req, res) => {
    try {
        console.log("Attempting to connect to database...");
        const client = await getDB();
        console.log("Database connected successfully");
        
        console.log("Attempting to query posts...");
        const query = await client.query('SELECT * FROM posts');
        console.log("Query successful, found", query.rows.length, "posts");
        
        res.render("hello.ejs", {
            Posts: query.rows,
        });
    } catch (err) {
        console.error("Detailed error in root route:", err);
        res.status(500).send("Error fetching posts: " + err.message);
    }
});

app.get("/write", (req, res) => {
    res.render("writeHome.ejs");
});

app.get("/writeContent", (req, res) => {
    res.render("writeContent.ejs");
});

app.get("/login", (req, res) => {
    res.render("login.ejs");
});

app.get("/register", (req, res) => {
    res.render("register.ejs");
});

app.get("/write_edit", (req, res) => {
    res.render("write_edit.ejs");
});

// Google OAuth routes
app.get("/auth/google", passport.authenticate("google", {
    scope: ["profile", "email"]
}));

app.get("/auth/google/callback",
    passport.authenticate("google", { failureRedirect: "/login" }),
    (req, res) => {
        res.redirect("/write_edit");
    }
);

// Registration
app.post("/register", async (req, res) => {
    const email = req.body.email;
    const pass = req.body.password;

    try {
        const client = await getDB();
        const checkResult = await client.query("SELECT * FROM userdata WHERE email = $1", [email]);

        if (checkResult.rows.length > 0) {
            res.send("Email already exists, please try logging in.");
        } else {
            bcrypt.hash(pass, saltRounds, async (err, hash) => {
                if (err) {
                    console.log(err);
                    res.status(500).send("Error during registration");
                } else {
                    await client.query("INSERT INTO userdata(email, password) VALUES ($1, $2)", [email, hash]);
                    res.render("write_edit.ejs");
                }
            });
        }
    } catch (err) {
        console.log(err);
        res.status(500).send("Error during registration");
    }
});

// Login
app.post("/login", passport.authenticate(
    "local", {
        successRedirect: "/write_edit",
        failureRedirect: "/login",
    }
));

// Submit post
app.post("/submit", async (req, res) => {
    const newTitle = req.body.Title;
    const newContent = req.body.content;
    const userID = req.user.id;

    try {
        const client = await getDB();
        await client.query("INSERT INTO posts (title, content, user_id) VALUES ($1, $2, $3)", 
            [newTitle, newContent, userID]);
        res.redirect("/");
    } catch (err) {
        console.log("Error fetching data:", err);
        res.status(500).send("Error saving Post!");
    }
});

// Delete post
app.post("/delete", async (req, res) => {
    const title = req.body.Title;

    try {
        const client = await getDB();
        await client.query("DELETE FROM posts WHERE title = $1", [title]);
        res.redirect("/");
    } catch (err) {
        console.log("Error deleting data:", err);
        res.status(500).send("Error deleting post");
    }
});

// Get user's posts
app.get("/edit_deleteContent", async (req, res) => {
    try {
        const userID = req.user.id;
        const client = await getDB();
        const posts = await client.query("SELECT * FROM posts WHERE user_id = $1", [userID]);
        res.render("editContent.ejs", {
            Post: posts.rows,
        });
    } catch (err) {
        console.log("Error fetching user posts:", err);
        res.status(500).send("Error fetching posts");
    }
});

// Edit post routes
app.get("/edit/:title", async (req, res) => {
    try {
        const postTitle = decodeURIComponent(req.params.title);
        const client = await getDB();
        const posts = await client.query("SELECT * FROM posts WHERE title = $1", [postTitle]);

        if (posts.rows.length === 0) {
            return res.status(404).send("Post not found!");
        }

        res.render("edit.ejs", {
            Post: posts.rows[0]
        });
    } catch (err) {
        console.log("Error fetching data (for get):", err);
        res.status(500).send("Error fetching post");
    }
});

app.post("/edit/:title", async (req, res) => {
    const postTitle = req.params.title;
    const title = req.body.Title;
    const content = req.body.content;

    try {
        const client = await getDB();
        const result = await client.query(
            "UPDATE posts SET title = $1, content = $2 WHERE title = $3",
            [title, content, postTitle]
        );
        if (result.rowCount === 0) {
            return res.status(404).send("Post not updated!");
        }
        res.redirect("/");
    } catch (err) {
        console.log("Error updating post:", err);
        res.status(500).send("Error updating post");
    }
});

// Passport local strategy
passport.use(
    new Strategy({ usernameField: "email", passwordField: "password" }, async function verify(email, password, cb) {
        try {
            const client = await getDB();
            const result = await client.query("SELECT * FROM userdata WHERE email = $1", [email]);

            if (result.rows.length > 0) {
                const user = result.rows[0];
                const storedPassword = user.password;

                bcrypt.compare(password, storedPassword, (err, isMatch) => {
                    if (err) {
                        console.log(err);
                        return cb(err);
                    } else if (isMatch) {
                        return cb(null, user);
                    } else {
                        return cb(null, false);
                    }
                });
            } else {
                return cb("User not found.");
            }
        } catch (err) {
            console.log(err);
            return cb(err);
        }
    })
);

// Passport Google strategy
passport.use(
    "google",
    new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.NODE_ENV === 'production' 
            ? "http://hello-blog-production.up.railway.app/auth/google/callback"  // Replace with your actual production URL
            : "http://localhost:3000/auth/google/callback",
        userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo",
    },
    async (accessToken, refreshToken, profile, cb) => {
        try {
            const email = profile.emails[0].value;
            const client = await getDB();
            const result = await client.query("SELECT * FROM userdata WHERE email = $1", [email]);

            if (result.rows.length === 0) {
                const newUser = await client.query(
                    "INSERT INTO userdata(email, password) VALUES($1, $2) RETURNING *",
                    [email, "google"]
                );
                return cb(null, newUser.rows[0]);
            } else {
                return cb(null, result.rows[0]);
            }
        } catch (err) {
            return cb(err);
        }
    })
);

passport.serializeUser((user, cb) => {
    cb(null, user);
});

passport.deserializeUser((user, cb) => {
    cb(null, user);
});

// Start server
if (process.env.NODE_ENV !== 'test') {
    app.listen(PORT, () => {
        console.log(`Server running on PORT ${PORT}`);
    });
}

export default app;