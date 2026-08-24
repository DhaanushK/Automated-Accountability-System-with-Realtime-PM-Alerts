import React from 'react';
import {
  Box,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Button,
  Divider
} from '@mui/material';
import {
  Inbox as InboxIcon,
  Send as SendIcon,
  Create as CreateIcon,
} from '@mui/icons-material';

const MailboxSidebar = ({ currentFolder, onFolderChange, onCompose }) => {
  const folders = [
    { id: 'inbox', name: 'Inbox', icon: <InboxIcon /> },
    { id: 'sent', name: 'Sent', icon: <SendIcon /> },
  ];

  return (
    <Box sx={{ width: '100%', bgcolor: 'background.paper' }}>
      <Box p={2}>
        <Button
          variant="contained"
          color="primary"
          startIcon={<CreateIcon />}
          fullWidth
          onClick={onCompose}
        >
          Compose
        </Button>
      </Box>
      
      <Divider />
      
      <List>
        {folders.map((folder) => (
          <ListItem
            button
            key={folder.id}
            selected={currentFolder === folder.id}
            onClick={() => onFolderChange(folder.id)}
            sx={{
              '&.Mui-selected': {
                backgroundColor: 'primary.light',
                '&:hover': {
                  backgroundColor: 'primary.light',
                },
              },
            }}
          >
            <ListItemIcon>{folder.icon}</ListItemIcon>
            <ListItemText primary={folder.name} />
          </ListItem>
        ))}
      </List>
    </Box>
  );
};

export default MailboxSidebar;