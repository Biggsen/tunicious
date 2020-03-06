import axios from 'axios'

const url = `${process.env.VUE_APP_SERVER_URL}/api/users/`

class AuthService {
    // Login
    static doLogin(user) {
        return new Promise((resolve, reject) => {
            axios.post(`${url}login`, user).then((res) => {
                const token = res.data.token
                localStorage.setItem('user-token', token)
                resolve(res)
            })
            .catch((err) => {
                localStorage.removeItem('user-token')
                reject(err)
            })
        })
    }

    // Get Artists
    static getUser() {
        return new Promise((resolve, reject) => {
            axios.get(`${url}profile`).then((res) => {
                resolve(res.data)
            })
            .catch((err) => {
                reject(err)
            })
        })
    }
}

export default AuthService