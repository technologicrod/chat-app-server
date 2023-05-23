const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const session = require('express-session');
const app = express();
const cors = require('cors');
app.use(
  cors({
    origin: true,
    credentials: true,
    optionsSuccessStatus: 200,
  })
);
app.use(express.urlencoded({ extended: true }));
const port = process.env.PORT || 8000;
const oneDay = 1000 * 60 * 60 * 24;
var admin = require('firebase-admin');
let serviceAccount;
if (process.env.GOOGLE_CREDENTIALS != null) {
  serviceAccount = JSON.parse(process.env.GOOGLE_CREDENTIALS);
} else {
  serviceAccount = require('./chat-db-394da-firebase-adminsdk-fwe1g-b78b86acda.json');
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();
const users = db.collection('users');
const messages = db.collection('messages');
const conversations = db.collection('conversations');

app.get('/', async function (req, res) {
  const items = await users.get();
  let data = { itemData: items.docs };
  res.json(data);
  console.log(data);
});

app.use(
  session({
    secret: 'secret',
    resave: true,
    cookie: { maxAge: oneDay },
    saveUninitialized: true,
    name: 'sessionID', // Set a unique name for the session cookie
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.log(err);
      res.sendStatus(500);
    } else {
      res.sendStatus(200);
    }
  });
});

app.post('/auth', async (req, res) => {
  const username = req.body.username;
  const pass = req.body.pass;

  const querySnapshot = await users
    .where('username', '==', username)
    .where('password', '==', pass)
    .get();

  const results = [];
  querySnapshot.forEach((doc) => {
    results.push(doc.data());
  });
  const userId = querySnapshot.docs.map((doc) => doc.id);
  console.log(userId);
  console.log('Results:', results); // Logging the results array

  if (results.length === 0) {
    res.json([{ username: '' }]); // Returning an empty JSON object
  } else {
    const sessionId = req.session.id; // Generate a unique session ID for each user
    req.session.regenerate((err) => {
      if (err) {
        console.log(err);
        res.sendStatus(500);
      } else {
        req.session.username = results[0].username;
        req.session.uid = userId;
        console.log('User ID:', req.session.uid); // Logging the uid value after it's set

        res.json(results);
      }
    });
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});


app.post("/logout", (req, res) => {
  req.session.loggedin = false
  req.session.username = ""
  un = ""
  uid = ""
})

app.get("/confirm", (req, res) => {
  if (req) {
  res.send(un);
      console.log("username", un)
} else {
  res.send('Please login to view this page!');
}
  var today = new Date()
  console.log("today: ", today)
res.end();
})
app.get("/fetchid", (req, res) => {
  if (req) {
  res.send(uid);
      console.log("user id", uid)
} else {
  res.send('Please login to view this page!');
}
  var today = new Date()
  console.log("today: ", today)
res.end();
})

app.post('/adduser', async (req, res) => {
  const username = req.body.username;
  const password = req.body.password;
  const email = req.body.email;

  // Check if username or email already exist
  const usernameQuery = await users.where('username', '==', username).get();
  const emailQuery = await users.where('email', '==', email).get();

  if (!usernameQuery.empty) {
    res.status(409).json({ message: 'Username already exists' });
    return;
  }

  if (!emailQuery.empty) {
    res.status(409).json({ message: 'Email already exists' });
    return;
  }

  const newUser = {
    username,
    password,
    email
  };

  try {
    const docRef = await users.add(newUser);
    console.log('User added with ID:', docRef.id);
    res.status(201).json({ message: 'User created successfully', userId: docRef.id });
  } catch (error) {
    console.error('Error adding user:', error);
    res.status(500).json({ message: 'Failed to create user' });
  }
});

app.get('/update/:uid', async function (req, res) {
  const userId = req.params.uid;
  const userRef = users.doc(userId);
  const userDoc = await userRef.get();

  if (!userDoc.exists) {
    res.status(404).json({ message: 'User not found' });
  } else {
    const userData = userDoc.data();
    res.json(userData);
    console.log(userData);
  }
});
app.put('/updateuser', async (req, res) => {
  const username = req.body.username;
  const password = req.body.password;
  const email = req.body.email;
  const userId = req.body.userId[0];
  console.log("id", userId)
  try {
    const userDoc = await users.doc(userId).get();

    if (!userDoc.exists) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    const currentUserData = userDoc.data();

    // Check if username or email already exist
    const usernameQuery = await users.where('username', '==', username).get();
    const emailQuery = await users.where('email', '==', email).get();

    if (
      !usernameQuery.empty &&
      usernameQuery.docs[0].id !== userId &&
      username !== currentUserData.username
    ) {
      res.status(409).json({ message: 'Username already exists' });
      return;
    }

    if (
      !emailQuery.empty &&
      emailQuery.docs[0].id !== userId &&
      email !== currentUserData.email
    ) {
      res.status(409).json({ message: 'Email already exists' });
      return;
    }

    const updatedUser = {
      username,
      password,
      email
    };

    await users.doc(userId).update(updatedUser);

    console.log('User updated with ID:', userId);
    res.status(200).json({ message: 'User updated successfully' });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ message: 'Failed to update user' });
  }
  un = username;
});

app.get('/search', async (req, res) => {
  const username = req.query.username;

  const querySnapshot = await users
    .where('username', '==', username)
    .get();

  const results = [];
  querySnapshot.forEach((doc) => {
    const result = doc.data();
    result.id = doc.id; // Add the unique ID from Firebase to the result object
    results.push(result);
  });

  res.json(results);
});
app.post('/conversations', async (req, res) => {
  try {
    const { members } = req.body;
    const createdAt = admin.firestore.FieldValue.serverTimestamp();
    const updatedAt = createdAt;

    // Create a new conversation document
    const conversationRef = await conversations.add({
      members: members,
      created_at: createdAt,
      updated_at: updatedAt
    });

    // Fetch the newly created conversation document
    const conversationSnapshot = await conversationRef.get();

    // Extract the data and ID from the conversation document
    const conversationData = conversationSnapshot.data();
    const conversationId = conversationSnapshot.id;

    // Add the ID to the conversation data
    const conversationWithId = {
      id: conversationId,
      ...conversationData
    };

    // Return the conversation data with the ID in the response
    res.status(201).json(conversationWithId);
  } catch (error) {
    console.error('Error creating conversation:', error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

app.get('/convo/:userid', async (req, res) => {
  try {
    const { userid } = req.params;
    console.log("id is", userid)

    // If userid is undefined or empty, return an empty array with the unique ID
    if (!userid) {
      return res.json([]);
    }

    // Query conversations collection for the specified userid
    const querySnapshot = await conversations
      .where('members', 'array-contains', userid)
      .get();

    if (querySnapshot.empty) {
      // No conversations found for the userid
      return res.status(404).json({ error: 'No conversations found for the userid' });
    }

    // Extract conversation data from the query result
    const conversationslist = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      const id = doc.id;
      conversationslist.push({ id, ...data });
    });

    // Return the conversations with the unique ID
    res.json(conversationslist);
  } catch (error) {
    console.error('Error retrieving conversations:', error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});
app.get('/messages', async (req, res) => {
  try {
    // Retrieve all documents from the messages collection
    const querySnapshot = await messages.get();

    // Extract clean message data from the query result
    const messageslist = querySnapshot.docs.map((doc) => doc.data());

    // Return the messages
    res.json(messageslist);
  } catch (error) {
    console.error('Error retrieving messages:', error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});


app.get('/messages/:conversationid', async (req, res) => {
  try {
    const { conversationid } = req.params;
    console.log(conversationid)
    // Retrieve messages with the given conversation ID
    const querySnapshot = await messages.where('conversationid', '==', conversationid).get();

    // Extract clean message data from the query result
    const messageslist = querySnapshot.docs.map((doc) => doc.data());

    // Return the messages
    res.json(messageslist);
  } catch (error) {
    console.error('Error retrieving messages:', error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});
app.get('/conversations', async (req, res) => {
  try {
    // Retrieve all documents from the conversations collection
    const querySnapshot = await conversations.get();

    // Extract conversation data from the query result
    const conversationslist = querySnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    // Return the conversations
    res.json(conversationslist);
  } catch (error) {
    console.error('Error retrieving conversations:', error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

app.post('/send', async (req, res) => {
  try {
    // Extract variables from the request body
    const { content, conversationid, receiverId, senderId, timestamp } = req.body;

    // Create a new message document
    const newMessage = {
      content,
      conversationid,
      receiverId,
      senderId,
      timestamp,
    };

    // Save the new message document to Firestore
    const result = await messages.add(newMessage);

    // Return the ID of the newly created message document
    res.status(201).json({ id: result.id });
  } catch (error) {
    console.error('Error creating message:', error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});
app.listen(port,);