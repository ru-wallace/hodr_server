
import { config } from "./config.js";
import Cookies from 'cookies';
import jwt from 'jsonwebtoken';



export function verifyToken(req, res, next) {
    // Check for token cookie
    const dest = req.path.slice(1);
    var redirect = "/login"
    if (dest) {
        redirect = "/login?dest=" + dest;
    }
    var cookies = new Cookies(req, res);
    const token = cookies.get('token');
    if (!token) {
        console.log('No token provided');
        return res.redirect(redirect); // Redirect to login if no token is provided
    }
    //console.log('Token found:', token);
    // Extract the token string from the header
    if (Array.isArray(token)) {
        return res.status(400).send('Invalid Token Format');
    }


    jwt.verify(token, config.access.secret, (err, decoded) => {
        if (err) {
            console.error('Token verification failed:', err);
            return res.status(400).redirect(redirect);

        }
        req.user = decoded;
        //console.log("Token verification succeed")
        next();
    });
}

export function verifyTokenWebsocket(req, socket, head) {
    var cookies = new Cookies(req, socket);
    const token = cookies.get('token');
    if (!token) {
        console.log('No token provided for WebSocket connection');
        socket.destroy(); // Close the socket if no token is provided
        return;
    }

    jwt.verify(token, config.access.secret, (err, decoded) => {
        if (err) {
            console.error('WebSocket token verification failed:', err);
            socket.destroy(); // Close the socket if token verification fails
            return;
        }
        req.user = decoded;
        console.log("WebSocket token verification succeed")
    });
    
}


export function login(req, res) {
    console.log(req.body);
    const { username, password, dest } = req.body;
    console.log("Dest:", dest)
    if (username === config.access.user && password === config.access.password) {
        // Generate a token
        const token = jwt.sign({ username }, config.access.secret);
        // Set the token in a cookie
        var cookies = new Cookies(req, res);
	var maxAuthAgeDays = 7;
	var maxAuthAgeMillisecs = 1000 * 60 * 60 * 24 * maxAuthAgeDays;
        cookies.set('token', token, { httpOnly: true, secure: false, maxAge: maxAuthAgeMillisecs }); // 7 day expiration
        console.log('User logged in:', username);
        if (dest) {
            return res.redirect('/' + dest);
        }
        return res.redirect('/');
    } else {
        console.error('Invalid credentials');
        return res.status(401).send('Invalid credentials');
    }
}

export function logout(req, res) {
    var cookies = new Cookies(req, res);
    cookies.set('token', '', { httpOnly: true, secure: false, maxAge: 0 }); // Clear the token cookie
    console.log('User logged out');
    return res.redirect('/login'); // Redirect to login page after logout
}
