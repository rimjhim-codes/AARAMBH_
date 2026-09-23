import mongoose from "mongoose";
import { generateTeacherAudio } from "../services/tts.service";
import { TtsCacheModel } from "../models/sih/TtsCache";
import { env } from "../config/env";

const languages = ["en", "hi", "bn", "ta", "te", "mr", "gu", "kn", "ml", "pa", "or", "ur"];

async function verify() {
  await mongoose.connect(env.mongoUri);
  console.log("Connected to MongoDB.");

  let allPassed = true;

  for (const lang of languages) {
    const testText = `Test_${lang}_${Date.now()}`;
    
    try {
      console.log(`\nTesting Language: ${lang}`);
      const t1 = Date.now();
      const base64First = await generateTeacherAudio(testText, lang);
      const msFirst = Date.now() - t1;
      
      if (!base64First) {
        console.error(`❌ FAIL: Missing audio payload for ${lang}`);
        allPassed = false;
        continue;
      }
      
      console.log(`✅ Cache MISS verified. Sarvam API response time: ${msFirst}ms`);

      const t2 = Date.now();
      const base64Second = await generateTeacherAudio(testText, lang);
      const msSecond = Date.now() - t2;
      
      if (base64First !== base64Second) {
        console.error(`❌ FAIL: Cache mismatch for ${lang}`);
        allPassed = false;
        continue;
      }
      
      if (msSecond > 500) {
        console.error(`❌ FAIL: Cache HIT took too long (${msSecond}ms), might be bypassing cache.`);
        allPassed = false;
        continue;
      }
      
      console.log(`✅ Cache HIT verified. Lookup time: ${msSecond}ms`);

    } catch (e: any) {
      console.error(`❌ FAIL: Exception during test for ${lang}:`, e.message);
      allPassed = false;
    }
  }

  await mongoose.disconnect();
  
  if (allPassed) {
    console.log("\n✅ ALL TESTS PASSED SUCCESSFULLY");
    process.exit(0);
  } else {
    console.error("\n❌ SOME TESTS FAILED");
    process.exit(1);
  }
}

verify().catch(console.error);
