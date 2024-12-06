import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import dotenv from "dotenv"

const app = express(); 
const PORT = 3000; 

dotenv.config();


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
    res.render("write.ejs")
})

app.post("/submit", async(req, res) => {

    const newTitle = req.body.Title;
    const newContent = req.body.content; 

    try {
        const newPost = await db.query("INSERT INTO posts (title, content) VALUES ($1, $2)", [newTitle, newContent])

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



app.listen(PORT, () => {
    console.log(`Server running on PORT ${PORT}.`)
})