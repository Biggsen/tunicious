import axios from 'axios'

const url = 'http://localhost:5000/api/artists/'

class ArtistService {
    // Get Artists
    static getArtists() {
        return new Promise(async (resolve, reject) => {
            try {
                const res = await axios.get(url)
                const data = res.data
                resolve(
                    data.map(artist => ({
                        ...artist,
                        createdAt: new Date(artist.createdAt)
                    }))
                )
            } catch(err) {
                reject(err)
            }
        })
    }

    // Create artist
    static insertArtist(name) {
        return axios.post(url, {
            name
        })
    }

    // Delete artist
    static deleteArtist(id) {
        return axios.delete(`${url}${id}`)
    }
}

export default ArtistService