import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IBlogPost extends Document {
  tenantId?: string;
  tenantRef?: Types.ObjectId;
  defaultLocale?: string;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  featuredImage?: string;
  category?: string;
  tags: string[];
  author: string;
  metaTitle?: string;
  metaDescription?: string;
  readTime?: number;
  status: 'draft' | 'published';
  featured: boolean;
  publishedAt?: Date;
  translations?: Record<
    string,
    {
      title?: string;
      excerpt?: string;
      content?: string;
      metaTitle?: string;
      metaDescription?: string;
      slug?: string;
      category?: string;
      tags?: string[];
      faqs?: { question: string; answer: string }[];
    }
  >;
  lastContentPublicationId?: Types.ObjectId;
  // FAQ pairs from the content engine → FAQPage JSON-LD (rich results).
  faqs?: { question: string; answer: string }[];
  createdAt: Date;
  updatedAt: Date;
}

const BlogTranslationSchema = new Schema(
  {
    title: { type: String, trim: true },
    excerpt: { type: String, trim: true },
    content: { type: String },
    metaTitle: { type: String, trim: true },
    metaDescription: { type: String, trim: true },
    slug: { type: String, lowercase: true, trim: true },
    category: { type: String, trim: true },
    tags: [{ type: String, trim: true }],
    faqs: {
      type: [{ question: { type: String, trim: true }, answer: { type: String, trim: true }, _id: false }],
      default: undefined,
    },
  },
  { _id: false }
);

const blogPostSchema = new Schema<IBlogPost>(
  {
    // Legacy posts may omit tenantId. Receiver-created posts always carry both
    // the stable tenant slug and its database reference.
    tenantId: { type: String, trim: true, index: true },
    tenantRef: { type: Schema.Types.ObjectId, ref: 'Tenant' },
    defaultLocale: { type: String, trim: true, default: 'en' },
    slug: { type: String, required: true, lowercase: true, trim: true, index: true },
    title: { type: String, required: true, trim: true },
    excerpt: { type: String, required: true, trim: true },
    content: { type: String, required: true },
    featuredImage: { type: String, trim: true },
    category: { type: String, trim: true, index: true },
    tags: { type: [String], default: [] },
    author: { type: String, trim: true, default: 'Editorial Team' },
    metaTitle: { type: String, trim: true },
    metaDescription: { type: String, trim: true },
    readTime: { type: Number },
    status: { type: String, enum: ['draft', 'published'], default: 'published', index: true },
    featured: { type: Boolean, default: false },
    publishedAt: { type: Date, index: true },
    translations: { type: Map, of: BlogTranslationSchema },
    faqs: {
      type: [{ question: { type: String, trim: true }, answer: { type: String, trim: true }, _id: false }],
      default: [],
    },
    lastContentPublicationId: { type: Schema.Types.ObjectId, ref: 'ContentPublication' },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_, ret) => {
        const obj = ret as Record<string, unknown>;
        delete obj.__v;
        return obj;
      },
    },
  }
);

// Same slug may exist per tenant, but is unique within a tenant.
blogPostSchema.index({ tenantId: 1, slug: 1 }, { unique: true });
blogPostSchema.index({ status: 1, publishedAt: -1 });

blogPostSchema.pre('save', function (next) {
  if (this.status === 'published' && !this.publishedAt) {
    this.publishedAt = new Date();
  }
  next();
});

export const BlogPost = mongoose.model<IBlogPost>('BlogPost', blogPostSchema);
