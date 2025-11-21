import { StatusBar } from "expo-status-bar";
import { useState, useEffect, useRef } from "react";
import { View, StyleSheet, Dimensions, Text, TouchableOpacity } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Gyroscope } from "expo-sensors";
import { Audio } from "expo-av";

const { width: screenWidth, height: screenHeight } = Dimensions.get("window");
const CANON_WIDTH = 60;
const CANON_HEIGHT = 60;

const BULLET_WIDTH = 8;
const BULLET_HEIGHT = 15;
const BULLET_SPEED = 8;

const OBSTACLE_WIDTH = 36;
const OBSTACLE_HEIGHT = 36;
const OBSTACLE_BASE_SPEED = 2.6;
const OBSTACLE_SPEED_STEP = 0.5;
const OBSTACLE_SPAWN_RATE = 14;

const SPEED_SCORE_INTERVAL = 300;
const GAME_SPEED = 16;
const GYROSCOPE_SENSITIVITY = 15;

export default function App() {
  const [canonX, setCanonX] = useState((screenWidth - CANON_WIDTH) / 2);
  const [bullets, setBullets] = useState([]);
  const [obstacles, setObstacles] = useState([]);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [gyroData, setGyroData] = useState({ x: 0, y: 0, z: 0 });
  const frameCount = useRef(0);
  const gameLoopRef = useRef(null);
  const bulletsRef = useRef([]);
  const obstaclesRef = useRef([]);
  const canonXRef = useRef((screenWidth - CANON_WIDTH) / 2);
  const gameOverRef = useRef(false);
  const scoreRef = useRef(0);
  const blastSoundRef = useRef(null);


  useEffect(() => {
    loadHighScore();
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadSound = async () => {
      try {
        const { sound } = await Audio.Sound.createAsync(
          { uri: BLAST_SOUND_URI },
          { volume: 0.6 }
        );
        if (isMounted) {
          blastSoundRef.current = sound;
        } else {
          await sound.unloadAsync();
        }
      } catch (error) {
        console.log("Error loading blast sound:", error);
      }
    };

    loadSound();

    return () => {
      isMounted = false;
      if (blastSoundRef.current) {
        blastSoundRef.current.unloadAsync();
        blastSoundRef.current = null;
      }
    };
  }, []);


  useEffect(() => {
    let subscription;

    const setupGyroscope = async () => {
      const isAvailable = await Gyroscope.isAvailableAsync();
      if (isAvailable) {
        Gyroscope.setUpdateInterval(16);
        subscription = Gyroscope.addListener(({ x, y, z }) => {
          setGyroData({ x, y, z });
        });
      }
    };

    setupGyroscope();

    return () => {
      if (subscription) {
        subscription.remove();
      }
    };
  }, []);

  useEffect(() => {
    if (!gameStarted || gameOver) return;
    const tilt = gyroData.y;
    setCanonX((prev) => {
      const newX = prev + tilt * GYROSCOPE_SENSITIVITY;
      return Math.max(0, Math.min(screenWidth - CANON_WIDTH, newX));
    });
  }, [gyroData, gameStarted, gameOver]);

  const loadHighScore = async () => {
    try {
      const saved = await AsyncStorage.getItem("highScore");
      if (saved !== null) {
        setHighScore(parseInt(saved, 10));
      }
    } catch (error) {
      console.log("Error loading high score:", error);
    }
  };

  const saveHighScore = async (newHighScore) => {
    try {
      await AsyncStorage.setItem("highScore", newHighScore.toString());
      setHighScore(newHighScore);
    } catch (error) {
      console.log("Error saving high score:", error);
    }
  };

  useEffect(() => {
    bulletsRef.current = bullets;
  }, [bullets]);

  useEffect(() => {
    obstaclesRef.current = obstacles;
  }, [obstacles]);

  useEffect(() => {
    canonXRef.current = canonX;
  }, [canonX]);

  useEffect(() => {
    gameOverRef.current = gameOver;
  }, [gameOver]);

  useEffect(() => {
    scoreRef.current = score;
  }, [score]);

  useEffect(() => {
    if (!gameStarted || gameOver) return;

    gameLoopRef.current = setInterval(() => {
      if (gameOverRef.current) return;

      frameCount.current += 1;
      if (frameCount.current % OBSTACLE_SPAWN_RATE === 0) {
        spawnObstacle();
      }
      setBullets((prev) =>
        prev
          .map((bullet) => ({
            ...bullet,
            y: bullet.y - BULLET_SPEED,
          }))
          .filter((bullet) => bullet.y > -BULLET_HEIGHT)
      );
      const speedLevel = Math.floor(scoreRef.current / SPEED_SCORE_INTERVAL);
      const currentSpeed = OBSTACLE_BASE_SPEED + speedLevel * OBSTACLE_SPEED_STEP;

      setObstacles((prev) =>
        prev
          .map((obstacle) => ({
            ...obstacle,
            y: obstacle.y + currentSpeed,
          }))
          .filter((obstacle) => obstacle.y < screenHeight + OBSTACLE_HEIGHT)
      );
      checkCollisions();
    }, GAME_SPEED);

    return () => {
      if (gameLoopRef.current) {
        clearInterval(gameLoopRef.current);
      }
    };
  }, [gameStarted, gameOver]);

  const spawnObstacle = () => {
    const x = Math.random() * (screenWidth - OBSTACLE_WIDTH);
    setObstacles((prev) => [
      ...prev,
      {
        id: Date.now() + Math.random(),
        x,
        y: -OBSTACLE_HEIGHT,
      },
    ]);
  };

  const playBlastSound = () => {
    const sound = blastSoundRef.current;
    if (!sound) return;
    sound.replayAsync().catch((error) => {
      console.log("Error playing blast sound:", error);
    });
  };

  const checkCollisions = () => {
    const currentBullets = bulletsRef.current;
    const currentObstacles = obstaclesRef.current;
    const currentCanonX = canonXRef.current;
    const hitObstacleIds = new Set();
    const hitBulletIds = new Set();

    for (const bullet of currentBullets) {
      for (const obstacle of currentObstacles) {
        if (
          bullet.x < obstacle.x + OBSTACLE_WIDTH &&
          bullet.x + BULLET_WIDTH > obstacle.x &&
          bullet.y < obstacle.y + OBSTACLE_HEIGHT &&
          bullet.y + BULLET_HEIGHT > obstacle.y
        ) {
          hitObstacleIds.add(obstacle.id);
          hitBulletIds.add(bullet.id);
          playBlastSound();
          setScore((prev) => prev + 10);
          break;
        }
      }
    }
    if (hitBulletIds.size > 0) {
      setBullets((prev) => prev.filter((b) => !hitBulletIds.has(b.id)));
    }
    if (hitObstacleIds.size > 0) {
      setObstacles((prev) => prev.filter((o) => !hitObstacleIds.has(o.id)));
    }


    for (const obstacle of currentObstacles) {
      if (obstacle.y + OBSTACLE_HEIGHT >= screenHeight - 20) {
        endGame();
        return;
      }

      if (
        obstacle.y + OBSTACLE_HEIGHT >= screenHeight - 20 - CANON_HEIGHT &&
        obstacle.y <= screenHeight - 20 &&
        obstacle.x < currentCanonX + CANON_WIDTH &&
        obstacle.x + OBSTACLE_WIDTH > currentCanonX
      ) {
        endGame();
        return;
      }
    }
  };

  const shoot = () => {
    if (gameOver || !gameStarted) return;
    const bulletX = canonX + CANON_WIDTH / 2 - BULLET_WIDTH / 2;
    const bulletY = screenHeight - 20 - CANON_HEIGHT;
    setBullets((prev) => [
      ...prev,
      {
        id: Date.now() + Math.random(),
        x: bulletX,
        y: bulletY,
      },
    ]);
  };

  const startGame = () => {
    setGameStarted(true);
    setGameOver(false);
    setScore(0);
    setBullets([]);
    setObstacles([]);
    frameCount.current = 0;
    setCanonX((screenWidth - CANON_WIDTH) / 2);
  };

  const endGame = () => {
    setGameOver(true);
    setGameStarted(false);
    const currentScore = scoreRef.current;
    if (currentScore > highScore) {
      saveHighScore(currentScore);
    }
  };

  const handleGameAreaPress = () => {
    if (!gameStarted && !gameOver) {
      startGame();
      return;
    }
    if (gameOver) {
      startGame();
      return;
    }
    if (gameStarted && !gameOver) {
      shoot();
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.scoreContainer}>
        <Text style={styles.scoreText}>Score: {score}</Text>
        <Text style={styles.highScoreText}>High: {highScore}</Text>
      </View>
      <TouchableOpacity
        style={styles.gameArea}
        activeOpacity={1}
        onPress={handleGameAreaPress}
      >
        <View style={[styles.canon, { left: canonX }]}>
          <View style={styles.canonBase} />
          <View style={styles.canonBulletChamber}>
            {[0, 1, 2].map((index) => (
              <View
                key={index}
                style={[
                  styles.canonBulletIndicator,
                  { top: index * 8 },
                ]}
              />
            ))}
          </View>
          <View style={styles.canonBarrel} />
          <View style={styles.canonWheel} />
          <View style={[styles.canonWheel, styles.canonWheelRight]} />
        </View>
        {bullets.map((bullet) => (
          <View
            key={bullet.id}
            style={[styles.bullet, { left: bullet.x, top: bullet.y }]}
          />
        ))}
        {obstacles.map((obstacle) => (
          <View
            key={obstacle.id}
            style={[
              styles.obstacle,
              { left: obstacle.x, top: obstacle.y },
            ]}
          >
            <View style={styles.rockHighlight} />
            <View style={styles.rockChip} />
          </View>
        ))}

      </TouchableOpacity>
      {(!gameStarted || gameOver) && (
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={handleGameAreaPress}
        >
          <Text style={styles.gameOverText}>
            {gameOver ? "Game Over!" : "Tap to Start"}
          </Text>
          {gameOver && (
            <Text style={styles.finalScoreText}>Final Score: {score}</Text>
          )}
          <Text style={styles.instructionText}>
            Tilt your phone to move the canon{'\n'}Tap anywhere to shoot
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1a1a2e",
  },
  scoreContainer: {
    position: "absolute",
    top: 50,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    zIndex: 10,
  },
  scoreText: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "bold",
    fontFamily: "Courier",
  },
  highScoreText: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "bold",
    fontFamily: "Courier",
  },
  gameArea: {
    flex: 1,
    width: "100%",
  },
  canon: {
    position: "absolute",
    bottom: 20,
    width: CANON_WIDTH,
    height: CANON_HEIGHT,
  },
  canonBulletChamber: {
    position: "absolute",
    bottom: 8,
    left: CANON_WIDTH / 2 - 6,
    width: 12,
    height: 28,
    backgroundColor: "#222",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#555",
    overflow: "hidden",
  },
  canonBulletIndicator: {
    position: "absolute",
    left: 2,
    width: 8,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#ffce54",
    borderWidth: 1,
    borderColor: "#e09c16",
  },
  canonBase: {
    position: "absolute",
    bottom: 0,
    left: 5,
    width: CANON_WIDTH - 10,
    height: 25,
    backgroundColor: "#34495e",
    borderRadius: 5,
    borderWidth: 2,
    borderColor: "#2c3e50",
  },
  canonBarrel: {
    position: "absolute",
    bottom: 20,
    left: CANON_WIDTH / 2 - 15,
    width: 30,
    height: 35,
    backgroundColor: "#7f8c8d",
    borderRadius: 15,
    borderWidth: 2,
    borderColor: "#2c3e50",
    transform: [{ rotate: "0deg" }],
  },
  canonWheel: {
    position: "absolute",
    bottom: 5,
    left: 5,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#2c3e50",
    borderWidth: 1,
    borderColor: "#1a1a1a",
  },
  canonWheelRight: {
    left: undefined,
    right: 5,
  },
  bullet: {
    position: "absolute",
    width: BULLET_WIDTH,
    height: BULLET_HEIGHT,
    backgroundColor: "#ffd700",
    borderRadius: 2,
    borderWidth: 1,
    borderColor: "#ffaa00",
  },
  obstacle: {
    position: "absolute",
    width: OBSTACLE_WIDTH,
    height: OBSTACLE_HEIGHT,
    borderRadius: OBSTACLE_WIDTH / 2,
    backgroundColor: "#5c5f66",
    borderWidth: 2,
    borderColor: "#2d2f33",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
    justifyContent: "center",
    alignItems: "center",
  },
  rockHighlight: {
    position: "absolute",
    width: OBSTACLE_WIDTH * 0.55,
    height: OBSTACLE_HEIGHT * 0.55,
    borderRadius: OBSTACLE_WIDTH * 0.35,
    backgroundColor: "rgba(255, 255, 255, 0.18)",
    top: 6,
    left: 9,
    transform: [{ rotate: "-20deg" }],
  },
  rockChip: {
    position: "absolute",
    width: OBSTACLE_WIDTH * 0.35,
    height: OBSTACLE_HEIGHT * 0.35,
    borderRadius: OBSTACLE_WIDTH * 0.2,
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    bottom: 6,
    right: 8,
    transform: [{ rotate: "25deg" }],
  },
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 100,
  },
  gameOverText: {
    color: "#FFF",
    fontSize: 32,
    fontWeight: "bold",
    fontFamily: "Courier",
    marginBottom: 20,
  },
  finalScoreText: {
    color: "#ffd700",
    fontSize: 24,
    fontWeight: "bold",
    fontFamily: "Courier",
    marginBottom: 20,
  },
  instructionText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Courier",
    textAlign: "center",
    paddingHorizontal: 40,
  },
});
