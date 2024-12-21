    import express from "express";
    import bodyParser from "body-parser";
    import pg from "pg";
    import dotenv from "dotenv"
    import bcrypt from "bcrypt"; 
    import passport from "passport";
    import { Strategy } from "passport-local"
    import session from "express-session";
    import GoogleStrategy from "passport-google-oauth2"; 

    const app = express(); 
    const PORT = 3000; 
    const saltRounds = 10; 
    dotenv.config();


    app.use(session({
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: true,
    }))

    app.use(passport.initialize());
    app.use(passport.session()); 


    const db = new pg.Client (
        {
            user: process.env.USER,
            host: process.env.HOST,
            database: process.env.DATA_BASE,
            password: process.env.PASSWORD,
            port: process.env.PORT
        }
    )

    db.connect(); 

    app.use(bodyParser.urlencoded({ extended: true } ))
    app.use(express.static('public'));

    app.get("/", async(req, res) => {

        try {

            const query = await db.query("SELECT * FROM posts") 
            res.render("hello.ejs",  {
                Posts: query.rows, 
            })

        } catch(err) {
            console.log("Error fetching data:", err);
        }
        
    })

    app.get("/write", (req, res) => {
        res.render("writeHome.ejs")
    })

    app.get("/writeContent", (req, res) => {
        res.render("writeContent.ejs"); 
    })

    app.get("/login", (req, res) => {
        res.render("login.ejs")
    })

    app.get("/register", (req, res) => {
        res.render("register.ejs")
    })

    app.get("/write_edit", (req, res) => {
        res.render("write_edit.ejs");
    })

    app.get("/auth/google", passport.authenticate("google", {
        scope:["profile", "email"]
    }));

    app.get("/auth/google/write_edit",
        passport.authenticate("google", { failureRedirect: "/login" }),
        (req, res) => {
            res.redirect("/write_edit"); 
        }
    );


    app.post("/register", async(req, res) => {

        const email = req.body.email; 
        const pass = req.body.password; 

        try{
            
            const checkResult = await db.query("Select * from userdata where email = $1", [email]);

            if(checkResult.rows.length > 0) {
                res.send("Email already exists, please try logging in.")
            } else {
                bcrypt.hash(pass, saltRounds, async(err, hash) => {
                    if(err) {
                        console.log(err);
                    } else {
                        const result = await db.query("Insert into userdata(email, password) values ($1, $2)", [email, hash] ); 
                        res.render("write_edit.ejs"); 
                    }
                })
            }
        } catch(err) {
            console.log(err); 
        }
    })

    app.post("/login", passport.authenticate(
        "local", {
            successRedirect: "/write_edit",
            failureRedirect:"/login", 
        }
    ))

    app.post("/submit", async(req, res) => {

        const newTitle = req.body.Title;
        const newContent = req.body.content; 
        const userID = req.user.id; 

        try {
            const newPost = await db.query("INSERT INTO posts (title, content, user_id) VALUES ($1, $2, $3)", [newTitle, newContent, userID])

        } catch(err) {
            console.log("Error fetching data:", err); 
            res.status(500).send("Error saving Post!")
        }

        res.redirect("/"); 

    })

    app.post("/delete", async(req, res) => {

        const title = req.body.Title; 

        try {
            await db.query("Delete from posts where title = $1", [title]);
            res.redirect("/");
        } catch(err) {
            console.log("Error deleting data:", err)
        }


    })

    app.get("/edit_deleteContent", async(req, res) => {

        const userID = req.user.id; 
        const posts = await db.query("Select * from posts where user_id = $1", [userID]); 

        res.render("editContent.ejs", {
            Post: posts.rows,
        }); 
    })

    app.get("/edit/:title", async(req, res) => {


        try {
            const postTitle = decodeURIComponent(req.params.title); 
            const posts = await db.query("Select * from posts where title = $1", [postTitle]); 

            if(posts.rows.length === 0) {
                return res.status(404).send("Post not found!")
            }
        
            res.render("edit.ejs", {
                Post: posts.rows[0]
            })

        } catch(err) {
            console.log("Error fetching data (for get):", err); 
        }


    })

    app.post("/edit/:title", async(req, res) => {
        const postTitle = req.params.title; 
        const title = req.body.Title;
        const content = req.body.content;  

        try {
            const result = await db.query("Update posts set title = $1, content = $2 Where title = $3", [title, content, postTitle]); 
            if(result.rows === 0) {
                return res.status(404).send("Post not updated!");
            }
            res.redirect("/"); 
        } catch(err) {
            console.log("Error for Post:", err);
        }
    })

    passport.use(
        new Strategy({ usernameField: "email", passwordField: "password" }, async function verify(email, password, cb) {

            try {
            
                const result = await db.query("Select * from userdata where email = $1", [email]); 
        
                if(result.rows.length > 0) {
                    const user = result.rows[0];
                    const storedPassword = user.password; 
        
                    bcrypt.compare(password, storedPassword, (err, isMatch)=> {
                        if(err) {
                            console.log(err);
                            return cb(err);
                        } else if(isMatch) {
                            return cb(null, user)
                        } else {
                            return cb(null, false)
                        }
                    })
                } else {
                    return cb("User not found.")
                }
        
            
            } catch(err) {
                console.log(err); 
                return cb(err);
            }
        })
    )

    passport.use(
        "google",
        new GoogleStrategy({
            clientID: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            callbackURL: "http://localhost:3000/auth/google/write_edit",
            userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo",
        },
        async (accessToken, refreshToken, profile, cb) => {
            try {
                const email = profile.emails[0].value;
                const result = await db.query("Select * from userdata where email = $1", [email]);

                if(result.rows.length === 0) {
                    const newUser = await db.query("Insert into userdata(email, password) values($1, $2)", [email, "google"]);
                    return cb(null, newUser.rows[0]);
                } else {
                    return cb(null, result.rows[0]);
                }
            } catch(err) {
                return cb(err); 
            }
        }
    ));

    passport.serializeUser((user, cb) => {
        cb(null, user)
    });

    passport.deserializeUser((user, cb) => {
        cb(null, user);
    })



    app.listen(PORT, () => {
        console.log(`Server running on PORT ${PORT}.`)
    })