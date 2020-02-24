const router = require('express').Router()
const slugify = require('slugify')
const Artist = require('../../models/artist')

// Get Artists
router.get('/', (req, res) => {
    Artist.find()
        .then(artists => res.json(artists))
        .catch(err => res.status(400).json('Error: ' + err))
})

// Create Artist
router.post('/', (req, res) => {
    const name = req.body.name
    const slug = slugify(req.body.name)
    const createdAt = new Date()

    const newArtist = new Artist({ name, slug, createdAt })

    newArtist.save()
        .then(() => res.json('Artist added!'))
        .catch(err => res.status(400).json('Error: ' + err))
})

// Delete (DELETE)
router.delete('/:id', (req, res) => {
    Artist.findByIdAndDelete(req.params.id)
        .then(artist => res.json('Artist deleted.'))
        .catch(err => res.status(400).json('Error: ' + err))
})

module.exports = router