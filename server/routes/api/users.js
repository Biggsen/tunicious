const router = require('express').Router()
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const passport = require('passport')
const User = require('../../models/user')

// Register User
router.post('/register', (req, res) => {
    const {
        email,
        password,
        confirm_password
    } = req.body

    const first = req.body.name.first
    const last = req.body.name.last

    if (password !== confirm_password) {
        return res.status(400).json({
            msg: 'Password do not match'
        })
    }

    // Check unique email
    User.findOne({
        email: email
    }).then((user) => {
        if (user) {
            return res.status(400).json({
                msg: 'Email is already taken'
            })
        }
    })

    const newUser = new User({
        name: {
            last,
            first
        },
        email,
        password
    })

    bcrypt.genSalt(10, (err, salt) => {
        bcrypt.hash(newUser.password, salt, (err, hash) => {
            if (err) throw err;
            newUser.password = hash
            newUser.save().then(user => {
                return res.status(201).json({
                    success: true,
                    msg: 'User is registered'
                })
            })

        })
    })
})

// Login User
router.post('/login', (req, res) => {
    User.findOne({ email: req.body.email }).then(user => {
        if (!user) {
            return res.status(400).json({
                success: false,
                msg: 'Email not found'
            })
        }

        bcrypt.compare(req.body.password, user.password).then(isMatch => {
            if(isMatch) {
                const payload = {
                    _id: user._id,
                    email: user.email,
                    first: user.name.first,
                    last: user.name.last,
                }

                jwt.sign(payload, process.env.SECRET, {
                    expiresIn: 604800
                }, (err, token) => {
                    res.status(200).json({
                        success: true,
                        token: `Bearer ${token}`,
                        msg: 'Logged in successfully'
                    })
                })

            } else {
                return res.status(400).json({
                    success: false,
                    msg: 'Incorrect password'
                })
            }
        })
    })
})

//  Get User Profile
router.get('/profile', passport.authenticate('jwt', {
    session: false
}), (req, res) => {
    return res.json({
        user: req.user
    })
})

module.exports = router