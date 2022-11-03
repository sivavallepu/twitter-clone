const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const path = require("path");
const dbPath = path.join(__dirname, "twitterClone.db");
const app = express();
app.use(express.json());
let database = null;
const initializeDbAndServer = async (request, response) => {
  try {
    database = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at port 3000");
    });
  } catch (error) {
    console.log(`DB Error:${error.message}`);
    process.exit(1);
  }
};

initializeDbAndServer();

//register api

app.post("/register/", async (request, response) => {
  const userDetails = request.body;
  const { username, name, password, gender } = userDetails;
  const getUserQuery = `
        SELECT *
        FROM user
        WHERE username = '${username}';
    `;
  const dbUser = await database.get(getUserQuery);
  if (dbUser !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else {
    const lenOfPassword = password.length;
    if (lenOfPassword < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);
      const registerUserQuery = `
                INSERT INTO user (username,name,password,gender)
                VALUES('${username}','${name}','${hashedPassword}','${gender}');
            `;
      await database.run(registerUserQuery);
      response.send("User created successfully");
    }
  }
});

//login api

app.post("/login/", async (request, response) => {
  const userDetails = request.body;
  const { username, password } = userDetails;
  const getUserQuery = `
        SELECT *
        FROM user
        WHERE username = '${username}';
    `;
  const dbUser = await database.get(getUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordValid = await bcrypt.compare(password, dbUser.password);
    if (isPasswordValid === false) {
      response.status(400);
      response.send("Invalid password");
    } else {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "powerstar");
      response.send({ jwtToken });
    }
  }
});

const authenticateWithJwtToken = (request, response, next) => {
  let jwtToken = null;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "powerstar", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

//API 3
app.get(
  "/user/tweets/feed/",
  authenticateWithJwtToken,
  async (request, response) => {
    const { username } = request;
    const getUserIdQuery = `
        SELECT user_id
        FROM user
        WHERE username = '${username}';
    `;
    const dbUserId = await database.get(getUserIdQuery);
    const { user_id } = dbUserId;
    const getTweetsQuery = `
        SELECT T2.username,T2.tweet,T2.date_time
        FROM ((user INNER JOIN follower ON user.user_id = follower.following_user_id) AS T1 NATURAL JOIN tweet) AS T2
        WHERE T2.follower_user_id = ${user_id}
        ORDER BY T2.date_time DESC
        LIMIT 4
        OFFSET 0;
    `;
    const dbTweets = await database.all(getTweetsQuery);
    response.send(
      dbTweets.map((eachPerson) => ({
        username: eachPerson["username"],
        tweet: eachPerson["tweet"],
        dateTime: eachPerson["date_time"],
      }))
    );
  }
);

//API 4
app.get(
  "/user/following/",
  authenticateWithJwtToken,
  async (request, response) => {
    const { username } = request;
    const getUserIdQuery = `
        SELECT user_id
        FROM user
        WHERE username = '${username}';
    `;
    const dbUserId = await database.get(getUserIdQuery);
    const { user_id } = dbUserId;
    const getNamesQuery = `
        SELECT T.name
        FROM (user INNER JOIN follower ON user.user_id = follower.following_user_id) AS T
        WHERE T.follower_user_id = ${user_id};
    `;
    const dbNames = await database.all(getNamesQuery);
    response.send(
      dbNames.map((eachPerson) => ({
        name: eachPerson["name"],
      }))
    );
  }
);

//API 5
app.get(
  "/user/followers/",
  authenticateWithJwtToken,
  async (request, response) => {
    const { username } = request;
    const getUserIdQuery = `
        SELECT user_id
        FROM user
        WHERE username = '${username}';
    `;
    const dbUserId = await database.get(getUserIdQuery);
    const { user_id } = dbUserId;
    const getNamesQuery = `
        SELECT T.name
        FROM (user INNER JOIN follower ON user.user_id = follower.follower_user_id) AS T
        WHERE T.following_user_id = ${user_id};
    `;
    const dbNames = await database.all(getNamesQuery);
    response.send(
      dbNames.map((eachPerson) => ({
        name: eachPerson["name"],
      }))
    );
  }
);

//API 6
app.get(
  "/tweets/:tweetId/",
  authenticateWithJwtToken,
  async (request, response) => {
    const { username } = request;
    const getUserIdQuery = `
        SELECT user_id
        FROM user
        WHERE username = '${username}';
    `;
    const dbUserId = await database.get(getUserIdQuery);
    const { tweetId } = request.params;
    const getUserIdOfTweetIdQuery = `
        SELECT user_id
        FROM tweet
        WHERE tweet_id = ${tweetId};
    `;
    const dbUserIdOfTweetId = await database.get(getUserIdOfTweetIdQuery);
    const { user_id } = dbUserIdOfTweetId;
    const getFollowingUserIdsQuery = `
        SELECT following_user_id
        FROM follower 
        WHERE follower_user_id = ${dbUserId.user_id};
    `;
    const dbFollowingUserIds = await database.all(getFollowingUserIdsQuery);
    const result = dbFollowingUserIds.some(
      (eachUserId) => eachUserId.following_user_id === user_id
    );
    if (result === false) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const getTweetLikesRepliesCountQuery = `
            SELECT tweet,(SELECT COUNT(like_id)
                           FROM like 
                           WHERE tweet_id=${tweetId}) AS likes,
                           (SELECT COUNT(reply_id)
                           FROM reply 
                           WHERE tweet_id=${tweetId}) AS replies,
                           date_time
            FROM tweet
            WHERE tweet_id = ${tweetId};
        `;
      const dbTweetLikesReplies = await database.get(
        getTweetLikesRepliesCountQuery
      );
      response.send({
        tweet: dbTweetLikesReplies["tweet"],
        likes: dbTweetLikesReplies["likes"],
        replies: dbTweetLikesReplies["replies"],
        dateTime: dbTweetLikesReplies["date_time"],
      });
    }
  }
);

//API 7
app.get(
  "/tweets/:tweetId/likes/",
  authenticateWithJwtToken,
  async (request, response) => {
    const { username } = request;
    const getUserIdQuery = `
        SELECT user_id
        FROM user
        WHERE username = '${username}';
    `;
    const dbUserId = await database.get(getUserIdQuery);
    const { tweetId } = request.params;
    const getUserIdOfTweetIdQuery = `
        SELECT user_id
        FROM tweet
        WHERE tweet_id = ${tweetId};
    `;
    const dbUserIdOfTweetId = await database.get(getUserIdOfTweetIdQuery);
    const { user_id } = dbUserIdOfTweetId;
    const getFollowingUserIdsQuery = `
        SELECT following_user_id
        FROM follower
        WHERE follower_user_id = ${dbUserId.user_id};
    `;
    const dbFollowingUserIds = await database.all(getFollowingUserIdsQuery);
    const result = dbFollowingUserIds.some(
      (eachUserId) => eachUserId.following_user_id === user_id
    );
    if (result === false) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const getUserNamesQuery = `
            SELECT T.username
            FROM (user NATURAL JOIN like) AS T
            WHERE T.tweet_id = ${tweetId};
        `;
      const dbUserNames = await database.all(getUserNamesQuery);
      let userNamesArray = [];
      dbUserNames.map((eachPerson) => userNamesArray.push(eachPerson.username));
      response.send({
        likes: userNamesArray,
      });
    }
  }
);

//API 8
app.get(
  "/tweets/:tweetId/replies/",
  authenticateWithJwtToken,
  async (request, response) => {
    const { username } = request;
    const getUserIdQuery = `
        SELECT user_id
        FROM user
        WHERE username = '${username}';
    `;
    const dbUserId = await database.get(getUserIdQuery);
    const { tweetId } = request.params;
    const getUserIdOfTweetIdQuery = `
        SELECT user_id
        FROM tweet
        WHERE tweet_id = ${tweetId};
    `;
    const dbUserIdOfTweetId = await database.get(getUserIdOfTweetIdQuery);
    const { user_id } = dbUserIdOfTweetId;
    const getFollowingUserIdsQuery = `
        SELECT following_user_id
        FROM follower 
        WHERE follower_user_id = ${dbUserId.user_id};
    `;
    const dbFollowingUserIds = await database.all(getFollowingUserIdsQuery);
    const result = dbFollowingUserIds.some(
      (eachUserId) => eachUserId.following_user_id === user_id
    );
    if (result === false) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const getRepliesQuery = `
            SELECT T.name,T.reply
            FROM (user NATURAL JOIN reply) AS T 
            WHERE T.tweet_id = ${tweetId};
        `;
      const dbReplies = await database.all(getRepliesQuery);
      let repliesArray = [];
      dbReplies.map((eachPerson) =>
        repliesArray.push({ name: eachPerson.name, reply: eachPerson.reply })
      );
      response.send({
        replies: repliesArray,
      });
    }
  }
);

//API 9
app.get(
  "/user/tweets/",
  authenticateWithJwtToken,
  async (request, response) => {
    const { username } = request;
    const getUserIdQuery = `
        SELECT user_id
        FROM user
        WHERE username = '${username}';
    `;
    const dbUserId = await database.get(getUserIdQuery);
    const { user_id } = dbUserId;
    const getTweetsOfUserQuery = `
        SELECT tweet,(SELECT COUNT(like_id) FROM like WHERE user_id=${user_id}) AS likes,(SELECT COUNT(reply_id) FROM reply WHERE user_id=${user_id}) AS replies,date_time
        FROM tweet
        WHERE user_id = ${user_id};
    `;
    const dbTweetsOfUser = await database.all(getTweetsOfUserQuery);
    console.log(dbTweetsOfUser);
    response.send(
      dbTweetsOfUser.map((eachTweet) => {
        return {
          tweet: eachTweet.tweet,
          likes: eachTweet.likes,
          replies: eachTweet.replies,
          dateTime: eachTweet.date_time,
        };
      })
    );
  }
);

//API 10
app.post(
  "/user/tweets/",
  authenticateWithJwtToken,
  async (request, response) => {
    const { username } = request;
    const getUserIdQuery = `
        SELECT user_id
        FROM user
        WHERE username = '${username}';
    `;
    const dbUserId = await database.get(getUserIdQuery);
    const { user_id } = dbUserId;
    const { tweet } = request.body;
    const date = new Date();
    const createTweetQuery = `
        INSERT INTO tweet(tweet,user_id,date_time)
        VALUES ('${tweet}',${user_id},'${date}');
    `;
    await database.run(createTweetQuery);
    response.send("Created a Tweet");
  }
);

//API 11
app.delete(
  "/tweets/:tweetId/",
  authenticateWithJwtToken,
  async (request, response) => {
    const { username } = request;
    const getUserIdQuery = `
        SELECT user_id
        FROM user
        WHERE username = '${username}';
    `;
    const dbUserId = await database.get(getUserIdQuery);
    const { tweetId } = request.params;
    const getUserIdOfTweetIdQuery = `
        SELECT user_id
        FROM tweet
        WHERE tweet_id = ${tweetId};
    `;
    const dbUserIdOfTweetId = await database.get(getUserIdOfTweetIdQuery);
    const { user_id } = dbUserIdOfTweetId;
    if (dbUserId.user_id !== user_id) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const deleteTweetQuery = `
            DELETE
            FROM tweet
            WHERE user_id = ${dbUserId.user_id};
        `;
      await database.run(deleteTweetQuery);
      response.send("Tweet Removed");
    }
  }
);

module.exports = app;
