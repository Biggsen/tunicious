import axios from 'axios'

const url = 'api/users/'

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
}

export default AuthService