import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Box,
  IconButton,
  Typography
} from '@mui/material';
import {
  Close as CloseIcon,
  AttachFile as AttachmentIcon
} from '@mui/icons-material';

const ComposeEmail = ({ open, onClose, onSend }) => {
  const [emailData, setEmailData] = useState({
    to: '',
    cc: '',
    subject: '',
    body: ''
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setEmailData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSend(emailData);
    setEmailData({ to: '', cc: '', subject: '', body: '' });
  };

  return (
    <Dialog 
      open={open} 
      onClose={onClose}
      fullWidth
      maxWidth="md"
    >
      <DialogTitle>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Typography variant="h6">Compose Email</Typography>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <form onSubmit={handleSubmit}>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            name="to"
            label="To"
            type="email"
            fullWidth
            value={emailData.to}
            onChange={handleChange}
            required
            variant="outlined"
          />
          
          <TextField
            margin="dense"
            name="cc"
            label="CC"
            type="email"
            fullWidth
            value={emailData.cc}
            onChange={handleChange}
            variant="outlined"
          />
          
          <TextField
            margin="dense"
            name="subject"
            label="Subject"
            fullWidth
            value={emailData.subject}
            onChange={handleChange}
            required
            variant="outlined"
          />
          
          <TextField
            margin="dense"
            name="body"
            label="Message"
            multiline
            rows={12}
            fullWidth
            value={emailData.body}
            onChange={handleChange}
            required
            variant="outlined"
          />
        </DialogContent>

        <DialogActions sx={{ p: 2 }}>
          <Button
            startIcon={<AttachmentIcon />}
            onClick={() => {}}
          >
            Attach
          </Button>
          <Box flex={1} />
          <Button onClick={onClose}>Cancel</Button>
          <Button 
            type="submit" 
            variant="contained" 
            color="primary"
            disabled={!emailData.to || !emailData.subject || !emailData.body}
          >
            Send
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

export default ComposeEmail;