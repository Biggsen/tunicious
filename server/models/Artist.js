const mongoose = require('mongoose')
const slugify = require('slugify')
const Schema = mongoose.Schema

// Create Artist Schema

const ArtistSchema = new Schema({
    name: { type: String, required: true },
    slug: { type: String, required: true },
    createdAt: Date
})

module.exports = Artist = mongoose.model('Artist', ArtistSchema)
