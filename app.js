const express = require('express')
const path = require('path')

const sqlite3 = require('sqlite3')
const {open} = require('sqlite')

const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const app = express()
app.use(express.json())

const dbPath = path.join(__dirname, 'twitterClone.db')
let db = null
const intializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('Server is Running at http://localhost:3000/')
    })
  } catch (error) {
    console.log(`DB Error: ${error.message}`)
    process.exit(1)
  }
}
intializeDBAndServer()

const getFollowingPeopleIdsOfUser = async username => {
  const getTheFollowingPeopleQuery = `
SELECT 
  following_user_id 
FROM follower
INNER JOIN user ON user_id = follower.follower_user_id 
WHERE user.username = '${username}'; 
`
  const followingPeople = await db.all(getTheFollowingPeopleQuery)
  const arrayOfIds = followingPeople.map(eachUser => eachUser.following_user_id)
  return arrayOfIds
}
const authentication = (request, response, next) => {
  let jwtToken
  const authHeader = request.headers['authorization']
  if (authHeader) {
    jwtToken = authHeader.split(' ')[1]
  }
  if (jwtToken) {
    jwt.verify(jwtToken, 'SECRET_KEY', async (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        request.username = payload.username
        request.userId = payload.userId
        next()
      }
    })
  } else {
    response.status(401)
    response.send('Invalid JWT Token')
  }
}

const tweetAcessVerification = async (request, response, next) => {
  const {userId} = request
  const {tweetId} = request.params

  const getTweetQuery = `
SELECT
    *
FROM 
    tweet INNER JOIN follower ON tweet.user_id = follower.following_user_id 
WHERE 
    tweet.tweet_id = '${tweetId}' AND follower_user_id = '${userId}';
`
  const tweet = await db.get(getTweetQuery)
  if (tweet === undefined) {
    response.status(401)
    response.send('Invalid Request')
  } else {
    next()
  }
}

app.post('/register/', async (request, response) => {
  const {username, password, name, gender} = request.body
  const getUserQuery = `SELECT * FROM user WHERE username='${username}';`
  const userDBDetails = await db.get(selectUserQuery)

  if (userDBDetails !== undefined) {
    response.status(400)
    response.send('User aldready exists')
  } else {
    if (password.length < 6) {
      response.status(400)
      response.send('Password is too short')
    } else {
      const hashedPassword = await bcrypt.hash(password, 10)
      const createUserQuery = `
            INSERT INTO
                user(username,password,name,gender)
            VALUES(
                '${name}',
                '${username}';
                '${hashedPassword}',
                '${gender}')`
      await db.run(createUserQuery)
      response.send('User created successfully')
    }
  }
})

app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const getUserQuery = `SELECT * FROM user WHERE username='${username}';`
  const userDbDetails = await db.get(getUserQuery)

  if (userDbDetails !== undefined) {
    const isPasswordCorrect = await bcrypt.compare(
      password,
      userDbDetails.password,
    )
    if (isPasswordCorrect) {
      const payload = {username, userId: userDbDetails.user_id}
      const jwtToken = jwt.sign(payload, 'SECRET_KEY')

      response.send({jwtToken})
    } else {
      response.send(400)
      response.send('Invalid password')
    }
  } else {
    response.status(400)
    response.send('Invalid user')
  }
})

app.get('/user/tweets/feed/', authentication, async (request, response) => {
  const {username} = request
  const followingPeopleIds = await getFollowingPeopleIdsOfUser(username)
  const getTweetsQuery = `
    SELECT username, tweet, date_time as dateTime 
    FROM user INNER JOIN tweet ON user.user_id=tweet.user_id 
    WHERE 
    user.user_id in (${followingPeopleIds})
    ORDER BY date_time DESC 
    LIMIT 4`

  const tweets = await db.all(getTweetsQuery)
  response.send(tweets)
})

app.get('/user/following/', authentication, async (request, response) => {
  const {username, userId} = request
  const getFollowingUserQuery = `SELECT name FROM follower INNER JOIN user ON user.user_id=follower.following_user_id 
    WHERE follower_user_id='${userId}';`
  const followingPeople = await db.all(getFollowingUserQuery)
  response.send(followingPeople)
})

app.get('/user/followers/'.authentication, async (request, response) => {
  const {username, userId} = request
  const getFollowersQuery = `SELECT DISTINCT name FROM follower INNER JOIN user ON user.user_id=follower.follower_user_id
    WHERE following_user_id='${userId}';`
  const followers = await db.all(getFollowersQuery)
  response.send(followers)
})

app.get(
  '/tweets/:tweetId/',
  authentication,
  tweetAcessVerification,
  async (request, response) => {
    const {username, userId} = request
    const {tweetId} = request.params
    const getTweetQuery = `SELECT tweet,
        
        (SELECT COUNT() FROM Like WHERE tweet_id='${tweetId}') AS likes,
        (SELECT COUNT() FROM reply WHERE tweet_id='${tweetId}') AS replies,
        date_time AS dateTime 
        FROM tweet 
        WHERE tweet.tweet_id='${tweetId}';`
    const tweet = await db.get(getTweetQuery)
    response.send(tweet)
  },
)

app.get(
  '/tweers/:tweetId/likes/',
  authentication,
  tweetAcessVerification,
  async (request, response) => {
    const {tweetId} = request.params
    const getLikesQuery = `SELECT username FROM user INNER JOIN like ON user.user_id=like.user_id 
        WHERE tweet_id='${tweetId}';`

    const likedUsers = await db.all(getLikesQuery)
    const usersArray = likedUsers.map(eachUser => eachUser.username)
    response.send({likes: usersArray})
  },
)

app.get(
  '/tweets/:tweetId/replies/',
  authentication,
  tweetAcessVerification,
  async (request, response) => {
    const {tweetId} = request.params
    const getRepliedQuery = `SELECT name,reply 
        FROM user INNER JOIN reply ON user.user_id=reply.user_id 
        WHERE tweet_id='${tweetId}';`
    const repliedUsers = await db.all(getRepliedQuery)
    response.send({replies: repliedUsers})
  },
)
app.get('/users/tweets/', authentication, async (request, response) => {
  const {userId} = request
  const getTweetsQuery = `
    SELECT tweet,
    COUNT(DISTINCT like_id) AS likes,
    COUNT(DISTINCT reply_id) AS replies,
    data_time AS dateTime 
    FROM tweet LEFT JOIN reply ON tweet.tweet_id=reply.tweet_id LEFT JOIN like ON tweet.tweet_id
    WHERE tweet.user_id='${userId}
    GROUP BY tweet.tweet_id;`
  const tweets = await db.all(getTweetsQuery)
  response.send(tweets)
})

app.post('/user/tweets/', authentication, async (request, response) => {
  const {tweet} = request.body
  const userId = parseInt(request.userId)
  const dateTime = new Date().toJSON().substring(0, 19).replace('T', ' ')
  const createTweetQuery = `INSERT INTO tweet(tweet(tweet,user_id,date_time)
  VALUES('${tweet}','${userId}','${dateTime})')`
  await db.run(createTweetQuery)
  response.send('Created a Tweet')
})

app.delete('/tweets/:tweetId', authentication, async (request, response) => {
  const {tweetId} = request.params
  const {userId} = request
  const getTheTweetQuery = `SELECT * FROM tweet WHERE user_id='${userId}' AND tweet_id='${tweetId}'`
  const tweet = await db.get(getTheTweetQuery)
  console.log(tweet)
  if (tweet === undefined) {
    response.status(401)
    response.send('Invalid Request')
  } else {
    const deleteTweetQuery = `DELETE FROM tweet WHERE tweet_id='${tweetId}'`
    await db.run(deleteTweetQuery)
    response.send('Tweet Removed')
  }
})

module.exports = app
