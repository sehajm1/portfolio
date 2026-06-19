import { useParams, Link } from 'react-router-dom';
import { marked } from 'marked';
import { POSTS } from '../posts';
import styles from './BlogPost.module.css';

export default function BlogPost() {
  const { slug } = useParams<{ slug: string }>();
  const post = POSTS.find(p => p.slug === slug);

  if (!post) {
    return (
      <div className={styles.notFound}>
        <p>Post not found.</p>
        <Link to="/blog" className={styles.back}>Back to writing</Link>
      </div>
    );
  }

  const html = marked(post.content) as string;

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <Link to="/blog" className={styles.back}>Back to writing</Link>

        <header className={styles.header}>
          <div className={styles.meta}>
            <span className={styles.platform}>{post.platform}</span>
            <span className={styles.date}>{new Date(post.date).toLocaleDateString('en-AU', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
          </div>
          <h1 className={styles.title}>{post.title}</h1>
          <p className={styles.description}>{post.description}</p>
          <div className={styles.tags}>
            {post.tags.map(t => <span key={t} className={styles.tag}>{t}</span>)}
          </div>
        </header>

        <article
          className={styles.content}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  );
}
