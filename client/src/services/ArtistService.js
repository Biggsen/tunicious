import axios from 'axios'

const url = 'api/artists/'

class ArtistService {
    // Get Artists
    static getArtists() {
        return new Promise((resolve, reject) => {
            axios.get(url).then((res) => {
                const data = res.data
                resolve(
                    data.map(artist => ({
                        ...artist,
                        createdAt: new Date(artist.createdAt)
                    }))
                )

            })
            .catch((err) => {
                reject(err)
            })
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