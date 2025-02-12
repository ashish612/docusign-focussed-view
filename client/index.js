const express = require("express");
const path = require("path");
const session = require("express-session");

const app = express();

app.use(session({
   secret: "320512ca46273a4600e8c8dc4b6c8ebd5fa7e56c58ed",
   resave: true,
   saveUninitialized: true,
}));

app.get("/", async (request, response) => {
    response.sendFile(path.join(__dirname, "main.html"));
 });

 app.listen(7000, () => {
    console.log("server has started");
 });

