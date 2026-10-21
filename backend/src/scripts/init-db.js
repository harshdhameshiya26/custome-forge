/* eslint-env node */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

// Load backend/.env
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '../../.env');
dotenv.config({ path: envPath });

// Import all 21 models
import Design from '../models/design.model.js';
import DesignRevision from '../models/design-revision.model.js';
import DesignFeedback from '../models/design-feedback.model.js';
import GuestSession from '../models/guest-session.model.js';
import DesignLibraryItem from '../models/design-library-item.model.js';
import MerchantSettings from '../models/merchant-settings.model.js';
import Proof from '../models/proof.model.js';
import Comment from '../models/comment.model.js';
import PrintFile from '../models/print-file.model.js';
import RoutingRule from '../models/routing-rule.model.js';
import CustomOrder from '../models/custom-order.model.js';
import Subscription from '../models/subscription.model.js';
import User from '../models/user.model.js';
import Schedule from '../models/schedule.model.js';
import ActionOtp from '../models/action-otp.model.js';
import ArtworkCheck from '../models/artwork-check.model.js';
import CustomOrderTimeline from '../models/custom-order-timeline.model.js';
import FeasibilityCheck from '../models/feasibility-check.model.js';
import Notification from '../models/notification.model.js';
import ProductCustomizationConfig from '../models/product-customization-config.model.js';
import ProductManufacturingConstraint from '../models/product-manufacturing-constraint.model.js';

const allModels = [
  Design,
  DesignRevision,
  DesignFeedback,
  GuestSession,
  DesignLibraryItem,
  MerchantSettings,
  Proof,
  Comment,
  PrintFile,
  RoutingRule,
  CustomOrder,
  Subscription,
  User,
  Schedule,
  ActionOtp,
  ArtworkCheck,
  CustomOrderTimeline,
  FeasibilityCheck,
  Notification,
  ProductCustomizationConfig,
  ProductManufacturingConstraint,
];

// Drop any legacy non-prefixed collections
const redundantCollectionsToDrop = [
  'Comment',
  'CustomOrder',
  'CustomOrderTimeline',
  'Notification',
  'PrintFile',
  'Proof',
  'RoutingRule',
  'Schedule',
  'Subscription',
];

// Additional Prisma collections to guarantee 100% presence in Atlas (all with tbl_ prefix)
const prismaCollections = [
  'tbl_Session',
  'tbl_User',
  'tbl_Design',
  'tbl_DesignRevision',
  'tbl_DesignSession',
  'tbl_DesignLibraryItem',
  'tbl_ArtworkCheck',
  'tbl_FeasibilityCheck',
  'tbl_Proof',
  'tbl_ProofApproval',
  'tbl_DesignComment',
  'tbl_OrderTimeline',
  'tbl_OrderTimelineEvent',
  'tbl_CustomOrderTimeline',
  'tbl_ProofRecords',
  'tbl_ProofComments',
  'tbl_ProductionFile',
  'tbl_print_files',
  'tbl_ProductionRule',
  'tbl_RoutingRule',
  'tbl_CustomOrder',
  'tbl_ProductionHandoff',
  'tbl_ProductCustomizationConfig',
  'tbl_Subscription',
  'tbl_Notification',
  'tbl_Schedule',
];

async function initializeDatabase() {
  const mongoUri = process.env.MONGODB_URI;
  console.log(`\nConnecting to MongoDB: ${mongoUri.replace(/:([^:@]+)@/, ':****@')} ...`);

  try {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 15000 });
    console.log(`Connected successfully to database: "${mongoose.connection.name}"!`);

    const db = mongoose.connection.db;
    const existingCollections = await db.listCollections().toArray();
    const existingNames = new Set(existingCollections.map((c) => c.name));

    console.log(`\nExisting collections in "${mongoose.connection.name}":`, Array.from(existingNames));

    console.log('\n--- Dropping Legacy Collections without tbl_ Prefix ---');
    for (const oldCol of redundantCollectionsToDrop) {
      if (existingNames.has(oldCol)) {
        try {
          await db.dropCollection(oldCol);
          console.log(`  Dropped non-prefixed collection: ${oldCol}`);
        } catch (err) {
          console.warn(`  Could not drop ${oldCol}:`, err.message);
        }
      }
    }
    for (const model of allModels) {
      const colName = model.collection.name;
      try {
        if (!existingNames.has(colName)) {
          await db.createCollection(colName);
          console.log(`  Created collection: ${colName}`);
        } else {
          console.log(`  Collection exists: ${colName}`);
        }
        await model.createIndexes();
        console.log(`    Synced indexes for: ${colName}`);
      } catch (err) {
        console.warn(`    Warning on ${colName}:`, err.message);
      }
    }

    console.log('\n--- Ensuring Prisma Schema Collections Exist ---');
    for (const pCol of prismaCollections) {
      try {
        if (!existingNames.has(pCol)) {
          await db.createCollection(pCol);
          console.log(`  Created Prisma collection: ${pCol}`);
        } else {
          console.log(`  Prisma collection exists: ${pCol}`);
        }
      } catch (err) {
        // NamespaceExists is fine
        if (!err.message.includes('already exists')) {
          console.warn(`    Warning on ${pCol}:`, err.message);
        }
      }
    }

    const finalCollections = await db.listCollections().toArray();
    console.log(`\n Total active collections now in "${mongoose.connection.name}": ${finalCollections.length}`);
    finalCollections.forEach((c) => console.log(`   - ${c.name}`));

    console.log('\nAll models connected and created in MongoDB Atlas successfully!\n');
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('\n Failed to initialize database:', err);
    process.exit(1);
  }
}

initializeDatabase();
