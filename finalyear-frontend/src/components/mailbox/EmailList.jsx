import React from 'react';
import {
  List,
  ListItem,
  ListItemText,
  Typography,
  CircularProgress,
  Box,
  Divider,
  Avatar,
  ListItemAvatar
} from '@mui/material';
import { AttachFile as AttachmentIcon } from '@mui/icons-material';
import { formatDistanceToNow } from 'date-fns';

const EmailList = ({ 
  emails, 
  loading, 
  error, 
  selectedEmailId, 
  onEmailSelect, 
  folder 
}) => {
  if (loading) {
    return (
      <Box display="flex" justifyContent="center" p={3}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box p={3}>
        <Typography color="error">Error loading emails: {error}</Typography>
      </Box>
    );
  }

  if (!emails?.length) {
    return (
      <Box p={3}>
        <Typography>No emails found</Typography>
      </Box>
    );
  }

  return (
    <List sx={{ width: '100%', bgcolor: 'background.paper' }}>
      {emails.map((email, index) => (
        <React.Fragment key={email.id}>
          <ListItem
            alignItems="flex-start"
            button
            selected={selectedEmailId === email.id}
            onClick={() => onEmailSelect(email)}
            sx={{
              '&.Mui-selected': {
                backgroundColor: 'action.selected',
              },
            }}
          >
            <ListItemAvatar>
              <Avatar>
                {folder === 'inbox' 
                  ? email.from?.charAt(0).toUpperCase() 
                  : email.to?.charAt(0).toUpperCase()}
              </Avatar>
            </ListItemAvatar>
            
            <ListItemText
              primary={
                <Box display="flex" justifyContent="space-between">
                  <Typography
                    component="span"
                    variant="subtitle1"
                    sx={{ fontWeight: !email.read ? 'bold' : 'normal' }}
                  >
                    {folder === 'inbox' ? email.from : email.to}
                  </Typography>
                  <Typography
                    component="span"
                    variant="caption"
                    color="text.secondary"
                  >
                    {formatDistanceToNow(new Date(email.date), { addSuffix: true })}
                  </Typography>
                </Box>
              }
              secondary={
                <React.Fragment>
                  <Typography
                    component="span"
                    variant="body2"
                    color="text.primary"
                    sx={{ display: 'block', fontWeight: !email.read ? 'bold' : 'normal' }}
                  >
                    {email.subject}
                  </Typography>
                  <Box display="flex" alignItems="center">
                    <Typography
                      component="span"
                      variant="body2"
                      color="text.secondary"
                      sx={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: '-webkit-box',
                        WebkitLineClamp: 1,
                        WebkitBoxOrient: 'vertical',
                      }}
                    >
                      {email.text}
                    </Typography>
                    {email.hasAttachments && (
                      <AttachmentIcon 
                        fontSize="small" 
                        sx={{ ml: 1, color: 'text.secondary' }} 
                      />
                    )}
                  </Box>
                </React.Fragment>
              }
            />
          </ListItem>
          {index < emails.length - 1 && <Divider variant="inset" component="li" />}
        </React.Fragment>
      ))}
    </List>
  );
};

export default EmailList;