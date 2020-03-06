const express = require('express')
const mongoose = require('mongoose')
const bodyParser = require('body-parser')
const path = require('path')
const cors = require('cors')
const passport = require('passport')

require('dotenv').config()

const app = express()
const port = process.env.PORT || 5000

// Middleware
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({
    extended: false
}))
app.use(cors())

app.use(passport.initialize())
require('./config/passport')(passport)

// connect to db
const uri = process.env.ATLAS_URI
mongoose.connect(uri, { useNewUrlParser: true, useCreateIndex: true })
    .then(() => {
        console.log('Database connection successful')
    }).catch(err => {
        console.log('Unable to connect to database')
    })


const users = require('./routes/api/users')
const artists = require('./routes/api/artists')

app.use('/api/users', users)
app.use('/api/artists', artists)


// Static folder
app.use(express.static(path.resolve(__dirname, './public')))

// Handle SPA
app.get('*', function(request, response) {
    response.sendFile(path.resolve(__dirname, './public', 'index.html'))
})


app.listen(port, () => console.log(`Server started on port ${port}`))

