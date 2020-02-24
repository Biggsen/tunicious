const mongoose = require('mongoose')
const Schema = mongoose.Schema

// Create User Schema

const UserSchema = new Schema({
    name: {
        last: String,
        first: { type: String, required: true }
    },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    isAdmin: false
}, {
    timestamps: true,
})

module.exports = User = mongoose.model('User', UserSchema)