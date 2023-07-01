const express = require('express')
const path = require('path')
const bodyParser = require('body-parser')
const session = require('express-session');
const app = express()
const cors = require('cors');
const multer = require('multer');
const upload = multer({storage:multer.memoryStorage()});
app.use(
    cors({
      origin: true,
      credentials: true,
      optionsSuccessStatus: 200
  }))
app.use(express.urlencoded({ extended: true }));
const port = process.env.PORT || 8000;
const oneDay = 1000 * 60 * 60 * 24;
var admin = require("firebase-admin");
let serviceAccount
if (process.env.GOOGLE_CREDENTIALS != null){
    serviceAccount = JSON.parse(process.env.GOOGLE_CREDENTIALS)
}
else {
    serviceAccount = require("./chat-db-394da-firebase-adminsdk-fwe1g-b78b86acda.json");
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();
const users = db.collection('users')
const messages = db.collection('messages')
const conversations = db.collection('conversations')
const logs = db.collection('logs')
app.get('/', async function (req, res) {
    const items = await users.get();
    let data = {itemData : items.docs}
    res.json(data)
    //console.log(data)
})
app.use(
  session({
    secret: 'secret',
    resave: true,
    cookie: { maxAge: oneDay },
    saveUninitialized: true,
    name: (req) => req.session.cookieName // Use the dynamically generated cookie name
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let un; // username
let uid; // userid

app.post('/logout', (req, res) => {
  const rdata = req.body.rdata;
  logs
    .where('userId', '==', rdata)
    .get()
    .then((querySnapshot) => {
      const batch = db.batch();

      querySnapshot.forEach((doc) => {
        batch.delete(doc.ref);
      });

      return batch.commit();
    })
    .then(() => {
      console.log('Log deleted');
      res.sendStatus(200);
    })
    .catch((error) => {
      console.error(error);
      res.sendStatus(500);
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
    const data = doc.data();
    data.id = doc.id; // Add the document ID to the data object
    results.push(data);
  });

  if (results.length === 0) {
    res.json([{ username: '' }]);
  } else {
    const userId = querySnapshot.docs.map((doc) => doc.id);

    // Check if any userIds already exist in the "logs" collection
    const logsQuerySnapshot = await logs.where('userId', 'in', userId).get();
    const logDeletionPromises = [];

    logsQuerySnapshot.forEach((logDoc) => {
      logDeletionPromises.push(logDoc.ref.delete());
    });

    // Wait for the deletion promises to complete before adding the new userId
    await Promise.all(logDeletionPromises);

    // Add the new userId to the "logs" collection
    const logCreationPromises = userId.map((uid) => logs.add({ userId: uid }));
    await Promise.all(logCreationPromises);

    req.session.username = results[0].username;
    req.session.uid = userId;
    un = req.session.username;
    uid = req.session.uid;

    res.json(results);
  }
});
app.get('/check', async (req, res) => {
  const loginid = req.query.loginid; // Get loginid from query parameters

  try {
    const logsRef = db.collection('logs').where('userId', '==', loginid);
    const logsQuery = await logsRef.get();

    if (!logsQuery.empty) {
      const logsDoc = logsQuery.docs[0];
      const logsData = logsDoc.data();
      res.send(logsData.userId);
      console.log('log data:', logsData.userId);
    } else {
      console.log('log not found', loginid);
      res.status(404).send('log not found');
    }
  } catch (error) {
    console.log('Error:', error);
    res.status(500).send('An error occurred');
  }
});


app.get('/confirm', async (req, res) => {
  const loginid = req.query.loginid; // Get loginid from query parameters

  try {
    const userRef = db.collection('users').doc(loginid);
    const userDoc = await userRef.get();

    if (userDoc.exists) {
      const userData = userDoc.data();
      res.send(userData.username);
      console.log('User data:', userData.username);
    } else {
      console.log('User not found');
      res.status(404).send('User not found');
    }
  } catch (error) {
    console.log('Error:', error);
    res.status(500).send('An error occurred');
  }
});

app.get('/fetchid', (req, res) => {
  const loginid = req.query.loginid; // Retrieve loginid from query parameters
  users
  .doc(loginid)
    .get()
    .then((doc) => {
      if (!doc.exists) {
        // No user found with the given loginid
        console.log('No user found');
        res.send(null);
      } else {
        // User found, send the user data including the document ID
        const userData = doc.data();
        const userDataWithId = {
          id: doc.id,
          ...userData,
        };
        //console.log('User data:', userDataWithId);
        res.send(userDataWithId);
      }
    })
    .catch((error) => {
      console.log('Error fetching user data:', error);
      res.status(500).send('Error fetching user data');
    });
});


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
    //console.log(userData);
  }
});
app.put('/updateuser', upload.single('profilepic'), async (req, res) => {
  const username = req.body.username;
  const password = req.body.password;
  const email = req.body.email;
  const userId = req.body.userId;
  const profilepic = req.file.buffer.toString('base64')
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
      email,
      profilepic
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
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});