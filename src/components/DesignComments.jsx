import { useState, useCallback } from 'react';
import {
  Card,
  BlockStack,
  InlineStack,
  Text,
  Badge,
  Button,
  TextField,
  Divider,
} from '@shopify/polaris';

/**
 * DesignComments
 * 
 * Reusable discussion thread component for proof revisions between merchant and customer:
 * - Role badges (Customer, Merchant, Factory Lead)
 * - Timestamp formatting
 * - Interactive input box for new replies
 * 
 * Strictly uses @shopify/polaris components and layout props (zero custom CSS).
 */
export default function DesignComments({
  initialComments = [],
  onAddComment = () => {},
  currentUserRole = 'merchant',
}) {
  const [comments, setComments] = useState(initialComments);
  const [commentText, setCommentText] = useState('');


  const handlePost = useCallback(() => {
    if (!commentText.trim()) return;
    const newEntry = {
      id: `c_${Date.now()}`,
      author: currentUserRole === 'merchant' ? 'Merchant Administrator' : 'Customer',
      role: currentUserRole,
      time: 'Just now',
      content: commentText.trim(),
    };
    setComments((prev) => [...prev, newEntry]);
    onAddComment(newEntry);
    setCommentText('');
  }, [commentText, currentUserRole, onAddComment]);

  return (
    <Card>
      <BlockStack gap="400">
        <Text variant="headingMd" as="h3">
          Design Revision &amp; Production Notes ({comments.length})
        </Text>
        <Divider />

        <BlockStack gap="300">
          {comments.length === 0 ? (
            <Text variant="bodySm" tone="subdued" as="p">
              No comments or revisions recorded yet (0).
            </Text>
          ) : (
            comments.map((item) => (
              <Card
                key={item.id}
                background={item.role === 'customer' ? 'bg-surface-secondary' : 'bg-surface'}
              >
                <BlockStack gap="100">
                  <InlineStack align="space-between">
                    <InlineStack gap="200" align="center">
                      <Text variant="bodyMd" fontWeight="bold">
                        {item.author}
                      </Text>
                      <Badge tone={item.role === 'customer' ? 'info' : 'success'} size="small">
                        {item.role.toUpperCase()}
                      </Badge>
                    </InlineStack>
                    <Text variant="bodySm" tone="subdued">
                      {item.time}
                    </Text>
                  </InlineStack>
                  <Text variant="bodyMd">{item.content}</Text>
                </BlockStack>
              </Card>
            ))
          )}
        </BlockStack>


        <BlockStack gap="200">
          <TextField
            label="Post Instruction or Feedback"
            value={commentText}
            onChange={setCommentText}
            multiline={3}
            placeholder="Type your design change or approval note..."
            autoComplete="off"
          />
          <InlineStack align="end">
            <Button onClick={handlePost} disabled={!commentText.trim()} variant="primary">
              Post Comment
            </Button>
          </InlineStack>
        </BlockStack>
      </BlockStack>
    </Card>
  );
}
