const express = require('express')
const mongodb = require('mongodb')
const slugify = require('slugify')

const router = express.Router()

// Get Artists
router.get('/', async (req, res) => {
    const artists = await loadArtistsCollection()
    res.send(await artists.find({}).toArray())
})

// Add Artist
router.post('/', async (req, res) => {
    const artists = await loadArtistsCollection()
    await artists.insertOne({
        name: req.body.name,
        slug: slugify(req.body.name),
        createdAt: new Date()
    })
    res.status(201).send()
})


// Delete Artist
router.delete('/:id', async (req, res) => {
    const artists = await loadArtistsCollection()
    await artists.deleteOne({_id: new mongodb.ObjectID(req.params.id)})
    res.status(200).send()
})

async function loadArtistsCollection() {
    const client = await mongodb.MongoClient.connect('mongodb://biggs_admin:nkqeoDHG10a6ccOg@audiofoodiedb-shard-00-00-vpqgw.mongodb.net:27017,audiofoodiedb-shard-00-01-vpqgw.mongodb.net:27017,audiofoodiedb-shard-00-02-vpqgw.mongodb.net:27017/devilliondb?retryWrites=true&ssl=true&authSource=admin&replicaSet=audiofoodiedb-shard-0', {useNewUrlParser: true
    })

    return client.db('devilliondb').collection('artists')
}


module.exports = router